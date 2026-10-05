// =============================================================================
// GESTIO 229 — Tableau de Bord Spécialisé Station-Service & Hydrocarbures
// =============================================================================
// Supervision temps réel de la station : Volumes, CA carburants, marges,
// jauges cuves, encaissements détaillés et centre d'alertes & anomalies.
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Fuel, Database, Gauge, AlertTriangle, TrendingUp, DollarSign,
  Smartphone, CreditCard, Landmark, CheckCircle, RefreshCw, Truck,
  ArrowUpRight, ArrowDownRight, Layers, ShieldAlert, Award
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useTenant } from '../../../hooks/useTenant'
import { formatFCFA } from '../../../utils/tax'

interface CuveStat {
  id: string
  nom: string
  produit: string
  capacite: number
  stock_actuel: number
  niveau_min: number
}

interface ShiftSummary {
  id: string
  date: string
  pompiste_nom: string
  pompe_numero: string
  produit: string
  volume_distribue: number
  montant_theorique: number
  montant_verse: number
  montant_especes: number
  montant_momo: number
  montant_credit: number
  ecart: number
}

interface JaugeageSummary {
  id: string
  cuve_nom: string
  produit: string
  ecart_volume: number
  date_jaugeage: string
}

const fmt = (n: number) => formatFCFA(n || 0)
const fmtVol = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n || 0) + ' L'

export const StationDashboardPage: React.FC = () => {
  const { companyId, sectorSlug } = useTenant()
  const [loading, setLoading] = useState(true)

  const [cuves, setCuves] = useState<CuveStat[]>([])
  const [shiftsToday, setShiftsToday] = useState<ShiftSummary[]>([])
  const [jaugeagesRecent, setJaugeagesRecent] = useState<JaugeageSummary[]>([])

  const loadDashboard = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const cleanSlug = sectorSlug || 'station-service'
      const today = new Date().toISOString().slice(0, 10)

      // Cuves
      const { data: cData } = await supabase
        .from('station_cuves')
        .select('id, nom, produit, capacite, stock_actuel, niveau_min')
        .eq('company_id', companyId)
        .eq('sector_slug', cleanSlug)
      setCuves(cData || [])

      // Shifts du jour
      const { data: sData } = await supabase
        .from('station_shifts_clotures')
        .select('*')
        .eq('company_id', companyId)
        .eq('sector_slug', cleanSlug)
        .eq('date', today)
      setShiftsToday(sData || [])

      // Jaugeages récents (30 derniers jours)
      const { data: jData } = await supabase
        .from('station_jaugeages')
        .select('id, cuve_nom, produit, ecart_volume, date_jaugeage')
        .eq('company_id', companyId)
        .eq('sector_slug', cleanSlug)
        .order('created_at', { ascending: false })
        .limit(10)
      setJaugeagesRecent(jData || [])

    } catch (err: any) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [companyId, sectorSlug])

  useEffect(() => { loadDashboard() }, [loadDashboard])

  // Agrégats du jour
  const volJour = shiftsToday.reduce((s, sh) => s + Number(sh.volume_distribue || 0), 0)
  const caJourTheorique = shiftsToday.reduce((s, sh) => s + Number(sh.montant_theorique || 0), 0)
  const caJourReel = shiftsToday.reduce((s, sh) => s + Number(sh.montant_verse || 0), 0)
  const ecartJour = shiftsToday.reduce((s, sh) => s + Number(sh.ecart || 0), 0)

  const especesJour = shiftsToday.reduce((s, sh) => s + Number(sh.montant_especes || 0), 0)
  const momoJour = shiftsToday.reduce((s, sh) => s + Number(sh.montant_momo || 0), 0)
  const creditJour = shiftsToday.reduce((s, sh) => s + Number(sh.montant_credit || 0), 0)

  // Ventes par carburant
  const carburantsMap: Record<string, { vol: number; ca: number }> = {}
  shiftsToday.forEach(sh => {
    const prod = sh.produit || 'Carburant'
    if (!carburantsMap[prod]) carburantsMap[prod] = { vol: 0, ca: 0 }
    carburantsMap[prod].vol += Number(sh.volume_distribue || 0)
    carburantsMap[prod].ca += Number(sh.montant_theorique || 0)
  })

  // Alertes cuves basses
  const alertesCuves = cuves.filter(c => Number(c.stock_actuel) <= Number(c.niveau_min))
  // Alertes écarts pompistes
  const alertesShifts = shiftsToday.filter(s => Number(s.ecart) < -1000)

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* ─── En-tête Pilote ─── */}
      <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700 rounded-3xl p-6 text-white shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-sm text-[11px] font-black uppercase tracking-wider">
              Station-Service & Hydrocarbures
            </span>
            <span className="text-xs text-orange-100">Supervision d'Exploitation</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">Tableau de Bord Station</h1>
          <p className="text-xs text-orange-100 mt-0.5">
            Situation temps réel des cuves, distributions pompes et flux financiers de la journée
          </p>
        </div>

        <button
          onClick={loadDashboard}
          disabled={loading}
          className="self-start md:self-auto px-4 py-2.5 bg-white text-orange-700 hover:bg-orange-50 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-orange-600' : ''}`} />
          Actualiser les données
        </button>
      </div>

      {/* ─── BANDEAU ALERTES ANOMALIES SI PRÉSENTES ─── */}
      {(alertesCuves.length > 0 || alertesShifts.length > 0) && (
        <div className="bg-rose-50 border-2 border-rose-200 rounded-3xl p-4 space-y-2">
          <p className="text-xs font-black text-rose-900 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            Alertes Prioritaires Détectées ({alertesCuves.length + alertesShifts.length})
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {alertesCuves.map(c => (
              <div key={c.id} className="p-2.5 bg-white rounded-xl border border-rose-200 text-rose-800 flex items-center justify-between">
                <span>⚠️ Cuve <strong>{c.nom}</strong> ({c.produit}) : Stock critique !</span>
                <span className="font-mono font-bold">{fmtVol(c.stock_actuel)} restant</span>
              </div>
            ))}
            {alertesShifts.map(s => (
              <div key={s.id} className="p-2.5 bg-white rounded-xl border border-rose-200 text-rose-800 flex items-center justify-between">
                <span>⚠️ Pompiste <strong>{s.pompiste_nom}</strong> : Manquant caisse constaté</span>
                <span className="font-mono font-bold text-rose-600">{fmt(s.ecart)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── KPI PRINCIPAUX DU JOUR ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Volume Distribué (Aujourd'hui)</p>
          <p className="text-2xl font-black text-orange-600 font-mono mt-2">{fmtVol(volJour)}</p>
          <p className="text-[11px] text-slate-400 mt-1">{shiftsToday.length} relève(s) pompistes</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">CA Carburant Théorique</p>
          <p className="text-2xl font-black text-slate-900 font-mono mt-2">{fmt(caJourTheorique)}</p>
          <p className="text-[11px] text-slate-400 mt-1">Calculé d'après les index</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Encaissement Réel Reversé</p>
          <p className="text-2xl font-black text-emerald-600 font-mono mt-2">{fmt(caJourReel)}</p>
          <p className="text-[11px] text-slate-400 mt-1">Reçu en caisse & comptes</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Écart Piste du Jour</p>
          <p className={`text-2xl font-black font-mono mt-2 ${ecartJour < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {ecartJour > 0 ? '+' : ''}{fmt(ecartJour)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">{ecartJour < 0 ? 'Manquant à régulariser' : 'Caisse équilibrée'}</p>
        </div>
      </div>

      {/* ─── DÉCOMPTE DES ENCAISSEMENTS PAR MOYEN DE PAIEMENT ─── */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
        <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-600" />
          Répartition des Règlements Encaissés Aujourd'hui
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl"><DollarSign className="w-5 h-5" /></div>
              <div>
                <p className="text-xs font-bold text-slate-500">Espèces Caisse</p>
                <p className="text-lg font-black text-slate-900 font-mono">{fmt(especesJour)}</p>
              </div>
            </div>
            <span className="text-xs font-bold text-emerald-700">
              {caJourReel > 0 ? Math.round((especesJour / caJourReel) * 100) : 0}%
            </span>
          </div>

          <div className="p-4 bg-amber-50/60 rounded-2xl border border-amber-200/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 text-amber-700 rounded-xl"><Smartphone className="w-5 h-5" /></div>
              <div>
                <p className="text-xs font-bold text-slate-500">MTN MoMo / Moov</p>
                <p className="text-lg font-black text-slate-900 font-mono">{fmt(momoJour)}</p>
              </div>
            </div>
            <span className="text-xs font-bold text-amber-700">
              {caJourReel > 0 ? Math.round((momoJour / caJourReel) * 100) : 0}%
            </span>
          </div>

          <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-200/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 text-blue-700 rounded-xl"><CreditCard className="w-5 h-5" /></div>
              <div>
                <p className="text-xs font-bold text-slate-500">Bons & Crédits Flottes</p>
                <p className="text-lg font-black text-slate-900 font-mono">{fmt(creditJour)}</p>
              </div>
            </div>
            <span className="text-xs font-bold text-blue-700">
              {caJourReel > 0 ? Math.round((creditJour / caJourReel) * 100) : 0}%
            </span>
          </div>
        </div>
      </div>

      {/* ─── SUIVI DES CUVES DE STOCKAGE (Niveaux Graphiques) ─── */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-black text-slate-900 text-base">État des Cuves de Carburant</h3>
            <p className="text-xs text-slate-500">Volume physique actuellement stocké vs Capacité nominale</p>
          </div>
          <span className="text-xs text-slate-400 font-mono">{cuves.length} cuve(s)</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cuves.map(c => {
            const remplissage = c.capacite > 0 ? Math.round((c.stock_actuel / c.capacite) * 100) : 0
            const isBas = Number(c.stock_actuel) <= Number(c.niveau_min)

            return (
              <div key={c.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-slate-900 text-sm">{c.nom}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isBas ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {isBas ? 'SEUIL CRITIQUE' : `${remplissage}%`}
                  </span>
                </div>

                <div className="text-xs font-bold text-orange-600">{c.produit}</div>

                <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      remplissage < 20 ? 'bg-rose-500' : remplissage < 40 ? 'bg-amber-500' : 'bg-orange-500'
                    }`}
                    style={{ width: `${Math.min(100, remplissage)}%` }}
                  />
                </div>

                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-500">Disponible : <strong>{fmtVol(c.stock_actuel)}</strong></span>
                  <span className="text-slate-400">Cap : {fmtVol(c.capacite)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ─── DÉTAIL PAR TYPE DE CARBURANT DU JOUR ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider mb-4">
            Ventes de Carburant par Produit (Aujourd'hui)
          </h3>
          {Object.keys(carburantsMap).length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">Aucun shift clôturé pour la date du jour.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(carburantsMap).map(([prod, val]) => (
                <div key={prod} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="font-black text-slate-900 text-xs">{prod}</p>
                    <p className="text-[11px] text-orange-600 font-mono font-bold mt-0.5">{fmtVol(val.vol)} distribués</p>
                  </div>
                  <p className="text-sm font-black text-slate-900 font-mono">{fmt(val.ca)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Derniers contrôles de jaugeage */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-black text-slate-900 text-sm uppercase tracking-wider mb-4">
            Derniers Jaugeages Réalisés
          </h3>
          {jaugeagesRecent.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">Aucun jaugeage récent enregistré.</p>
          ) : (
            <div className="space-y-2">
              {jaugeagesRecent.slice(0, 5).map(j => {
                const ec = Number(j.ecart_volume || 0)
                return (
                  <div key={j.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-900">{j.cuve_nom}</span>
                      <span className="text-[10px] text-slate-400 ml-2">({j.date_jaugeage})</span>
                    </div>
                    <span className={`font-mono font-bold ${
                      ec < 0 ? 'text-rose-600' : ec > 0 ? 'text-blue-600' : 'text-emerald-600'
                    }`}>
                      Écart : {ec > 0 ? '+' : ''}{fmtVol(ec)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
export default StationDashboardPage
