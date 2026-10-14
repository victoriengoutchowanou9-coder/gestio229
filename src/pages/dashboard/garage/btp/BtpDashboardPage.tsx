// =============================================================================
// GESTIO 229 SaaS — Tableau de Bord Direction BTP & Maintenance Multisite
// Conforme Spécification Section 5.12
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Truck, HardHat, Building2, Fuel, Wrench, AlertTriangle,
  CheckCircle2, Clock, DollarSign, Plus, ArrowUpRight, Shield,
  Layers, RefreshCw, ChevronRight, BarChart3, MapPin
} from 'lucide-react'
import { useTenant } from '../../../../hooks/useTenant'
import { useUIStore } from '../../../../store/uiStore'
import { formatFCFA } from '../../../../utils/tax'
import { Link } from 'react-router-dom'
import { BtpMateriel, BtpChantier, BtpOrdreMaintenance } from '../../../../services/garageService'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

export const BtpDashboardPage: React.FC = () => {
  const { companyId, supabaseTenant, sectorSlug } = useTenant()
  const { toast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [materiels, setMateriels] = useState<BtpMateriel[]>([])
  const [chantiers, setChantiers] = useState<BtpChantier[]>([])
  const [ordresMaintenance, setOrdresMaintenance] = useState<BtpOrdreMaintenance[]>([])
  const [totalCarburantLitres, setTotalCarburantLitres] = useState(0)
  const [totalCarburantCout, setTotalCarburantCout] = useState(0)
  const [alertesMaintenanceCount, setAlertesMaintenanceCount] = useState(0)

  const prefix = `/app/${sectorSlug || 'garage'}`

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [matRes, chtRes, omRes, carbRes] = await Promise.all([
        supabaseTenant('btp_materiels').select('*').order('code_materiel'),
        supabaseTenant('btp_chantiers').select('*').order('created_at', { ascending: false }),
        supabaseTenant('btp_ordres_maintenance').select('*').order('created_at', { ascending: false }).limit(20),
        supabaseTenant('btp_carburant_pleins').select('quantite_litres, montant_total, est_surconsommation_anormale').limit(200)
      ])

      const mats: BtpMateriel[] = matRes.data || []
      setMateriels(mats)
      setChantiers(chtRes.data || [])
      setOrdresMaintenance(omRes.data || [])

      // Alertes de maintenance (si compteur actuel >= compteur prochaine maintenance)
      const alerts = mats.filter(m => {
        if (!m.compteur_prochaine_maintenance) return false
        const currentCounter = m.type_compteur === 'HEURES_MOTEUR' ? m.compteur_heures_actuel : m.compteur_km_actuel
        return currentCounter >= m.compteur_prochaine_maintenance
      })
      setAlertesMaintenanceCount(alerts.length)

      // Carburant du mois
      let lTot = 0
      let cTot = 0
      if (carbRes.data) {
        carbRes.data.forEach((p: any) => {
          lTot += Number(p.quantite_litres) || 0
          cTot += Number(p.montant_total) || 0
        })
      }
      setTotalCarburantLitres(lTot)
      setTotalCarburantCout(cTot)
    } catch (err: any) {
      console.warn('[BtpDashboard] Erreur chargement:', err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Statistiques de disponibilité du parc BTP
  const totalParc = materiels.length
  const operationnels = materiels.filter(m => m.statut === 'DISPONIBLE' || m.statut === 'AFFECTE_CHANTIER').length
  const enMaintenance = materiels.filter(m => m.statut === 'EN_MAINTENANCE' || m.statut === 'EN_PANNE').length
  const immobilises = materiels.filter(m => m.statut === 'IMMOBILISE' || m.statut === 'REFORME').length
  const tauxDisponibilite = totalParc > 0 ? Math.round((operationnels / totalParc) * 100) : 100

  return (
    <div className="space-y-6">
      {/* ── En-tête BTP Direction ── */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950 rounded-3xl p-6 text-white shadow-xl border border-amber-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold uppercase tracking-wider mb-2 border border-amber-500/30">
            <Truck className="w-3.5 h-3.5" />
            Parc Matériel BTP & Maintenance Multisite
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Supervision Direction & Parc Engins
          </h1>
          <p className="text-sm text-slate-300 mt-1">
            Taux de disponibilité, compteurs machines, consommation carburant et chantiers actifs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to={`${prefix}/parc-materiel`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md shadow-amber-600/30 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Ajouter un Matériel
          </Link>
          <Link
            to={`${prefix}/maintenance-preventive`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 shadow-md transition cursor-pointer"
          >
            <Wrench className="w-4 h-4" />
            Ordre de Maintenance
          </Link>
          <button
            onClick={loadData}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
            title="Actualiser"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* ── Cartes d'Indicateurs Stratégiques ── */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Taux de Disponibilité */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Disponibilité Parc</p>
            <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{tauxDisponibilite}%</h3>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">{operationnels} / {totalParc} engins prêts</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Engins en Maintenance / Panne */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">En Maintenance</p>
            <h3 className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{enMaintenance}</h3>
            <p className="text-[11px] text-amber-600 font-medium mt-0.5">En atelier ou dépannage</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
            <Wrench className="w-6 h-6" />
          </div>
        </div>

        {/* Carburant du Mois */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Carburant Consommé</p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">{Number(totalCarburantLitres).toLocaleString()} L</h3>
            <p className="text-[11px] text-emerald-600 font-bold mt-0.5">{fmt(totalCarburantCout)}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
            <Fuel className="w-6 h-6" />
          </div>
        </div>

        {/* Maintenances Dépassées */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Alertes Entretien</p>
            <h3 className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">{alertesMaintenanceCount}</h3>
            <p className="text-[11px] text-rose-600 font-medium mt-0.5">Compteur seuil atteint</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* ── Chantiers Actifs & Affectations ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chantiers en Cours */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-amber-600" />
              Chantiers & Déploiements Actifs
            </h2>
            <Link
              to={`${prefix}/chantiers-affectations`}
              className="text-xs font-bold text-amber-600 hover:underline flex items-center gap-1"
            >
              <span>Gérer les chantiers</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {chantiers.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">
              Aucun chantier créé. Ajoutez vos chantiers pour y affecter des engins.
            </div>
          ) : (
            <div className="space-y-3">
              {chantiers.slice(0, 5).map(c => (
                <div key={c.id} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-amber-700 dark:text-amber-400">{c.code_chantier}</span>
                      <span className="font-bold text-xs text-slate-900 dark:text-white">{c.nom_chantier}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                      <span>Client : {c.client_nom}</span>
                      <span>•</span>
                      <span>Chef : {c.chef_chantier_nom || 'Non défini'}</span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                    {c.statut}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dernières Interventions de Maintenance */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Wrench className="w-5 h-5 text-emerald-600" />
              Interventions Récentes de Maintenance
            </h2>
            <Link
              to={`${prefix}/maintenance-preventive`}
              className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1"
            >
              <span>Voir tout</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {ordresMaintenance.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">
              Aucune intervention de maintenance enregistrée.
            </div>
          ) : (
            <div className="space-y-3">
              {ordresMaintenance.slice(0, 5).map(om => (
                <div key={om.id} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-slate-800 dark:text-slate-200">{om.numero_om}</span>
                      <span className={clsx(
                        'px-2 py-0.5 rounded text-[10px] font-bold',
                        om.type_intervention === 'CORRECTIVE_PANNE' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                      )}>
                        {om.type_intervention}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 font-medium">
                      {om.diagnostic_panne || om.travaux_effectues || 'Entretien périodique programmé'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-xs text-slate-900 dark:text-white">{fmt(om.cout_total || 0)}</span>
                    <div className="text-[10px] text-slate-400">{om.statut}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default BtpDashboardPage
