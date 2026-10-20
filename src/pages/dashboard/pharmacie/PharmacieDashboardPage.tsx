// =============================================================================
// GESTIO 229 — COCKPIT & TABLEAU DE BORD PHARMACIE & DÉPÔT MÉDICAL
// =============================================================================
import React, { useState, useEffect } from 'react'
import {
  Activity,
  AlertTriangle,
  FileText,
  Package,
  Layers,
  TrendingUp,
  ShieldAlert,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Pill,
  Sparkles,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { pharmacieService } from '../../../services/pharmacieService'
import { Link } from 'react-router-dom'

export default function PharmacieDashboardPage() {
  const { currentCompany, sectorSlug } = useTenant()
  const companyId = currentCompany?.id || ''
  const routePrefix = sectorSlug ? `/app/${sectorSlug}` : '/dashboard/pharmacie'

  const [metrics, setMetrics] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const chargerDonnees = async () => {
    try {
      setLoading(true)
      const data = await pharmacieService.getDashboardMetrics(companyId)
      setMetrics(data)
    } catch (err) {
      console.error('Erreur chargement metrics pharmacie:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    chargerDonnees()
  }, [companyId])

  const fmt = (n: number) => (n || 0).toLocaleString('fr-FR')

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* En-tête Cockpit Officine */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-emerald-400/30 flex items-center gap-1">
              <Pill className="w-3.5 h-3.5" /> GESTIO229 Officine Pro
            </span>
            <span className="text-emerald-200/80 text-xs font-mono">Bénin Santé & Dépôt</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Pharmacie & Dépôt Médical
          </h1>
          <p className="text-emerald-100/80 text-sm mt-1 max-w-2xl">
            Suivi des délivrances au comptoir, traçabilité FEFO par lot, alertes de péremption, validation des ordonnances et veille qualité.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to={`${routePrefix}/vente-pos`}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-slate-950 font-bold rounded-xl shadow-lg transition"
          >
            <Activity className="w-4 h-4" /> Vente Comptoir (POS)
          </Link>
          <Link
            to={`${routePrefix}/ordonnances`}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl border border-white/20 transition"
          >
            <FileText className="w-4 h-4" /> Ordonnances
          </Link>
        </div>
      </div>

      {/* Bannière Officine Vierge */}
      {!loading && metrics && metrics.totalReferences === 0 && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-bold text-emerald-900 dark:text-emerald-200 text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" /> Espace Pharmacie & Dépôt Médical Prêt
            </h3>
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              Votre catalogue officinal est actuellement vierge. Commencez par créer vos fiches médicaments réelles ou passez votre première commande grossiste.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`${routePrefix}/catalogue`}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow"
            >
              + Ajouter un Médicament
            </Link>
            <Link
              to={`${routePrefix}/commandes`}
              className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-bold"
            >
              Fournisseurs & Commandes
            </Link>
          </div>
        </div>
      )}

      {/* Cartes KPI Temps Réel */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Recettes du jour */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Délivrances Jour</span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {fmt(metrics?.caAujourdhui)} <span className="text-xs font-medium text-slate-500">FCFA</span>
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
            <span>Encaissé: {fmt(metrics?.encaisseAujourdhui)} F</span>
            <span className="text-emerald-600 font-bold">{metrics?.nbVentesAujourdhui || 0} tickets</span>
          </div>
        </div>

        {/* Valeur du stock */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Valeur Stock Actuel</span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 rounded-lg">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {fmt(metrics?.valeurStockAchat)} <span className="text-xs font-medium text-slate-500">FCFA</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {metrics?.totalReferences || 0} références • {metrics?.totalLotsActifs || 0} lots actifs
          </div>
        </div>

        {/* Lots proches péremption */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Péremptions &lt; 90j</span>
            <div className="p-2 bg-amber-50 dark:bg-amber-950/40 text-amber-600 rounded-lg">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
            {metrics?.lotsExpire90jCount || 0} <span className="text-xs font-medium text-slate-500">lots</span>
          </div>
          <div className="text-xs text-amber-700/80 dark:text-amber-300 mt-1">
            dont <span className="font-bold text-rose-600">{metrics?.lotsExpire30jCount || 0}</span> critiques à &le; 30j
          </div>
        </div>

        {/* Alertes & Ordonnances */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Vigilance & Ordonnances</span>
            <div className="p-2 bg-rose-50 dark:bg-rose-950/40 text-rose-600 rounded-lg">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <span>{metrics?.ordonnancesEnAttenteCount || 0}</span>
            {metrics?.rappelsEnCoursCount > 0 && (
              <span className="text-xs bg-rose-600 text-white font-bold px-2 py-0.5 rounded-full animate-pulse">
                {metrics?.rappelsEnCoursCount} rappel(s)
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Ordonnances à servir ou partielles
          </div>
        </div>
      </div>

      {/* Section Alertes Immédiates & Sécurité Sanitaire */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lots prioritaires FEFO expirant bientôt */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Priorité FEFO : Alertes Péremptions Imminentes
            </h2>
            <Link
              to={`${routePrefix}/lots`}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
            >
              Tous les lots <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-2.5">
            {metrics?.lotsExpire30j?.length === 0 ? (
              <div className="text-sm text-slate-500 text-center py-6 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                Aucun lot n'expire dans les 30 prochains jours.
              </div>
            ) : (
              metrics?.lotsExpire30j?.map((lot: any) => (
                <div
                  key={lot.id}
                  className="flex items-center justify-between p-3 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 rounded-xl text-sm"
                >
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">{lot.produit_nom}</div>
                    <div className="text-xs text-slate-500">
                      Lot : <span className="font-mono font-semibold">{lot.numero_lot}</span> • Emplacement: {lot.emplacement_rayon || lot.depot_nom}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                      Exp: {lot.date_peremption}
                    </span>
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                      Reste : {lot.quantite_actuelle} btes
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Ruptures et stocks critiques */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-500" />
              Stocks Critiques & Ruptures à Réapprovisionner
            </h2>
            <Link
              to={`${routePrefix}/commandes`}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
            >
              Commander grossiste <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-2.5">
            {metrics?.produitsEnAlerte?.length === 0 && metrics?.produitsEnRupture?.length === 0 ? (
              <div className="text-sm text-slate-500 text-center py-6 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                Tous les stocks sont au-dessus des seuils de sécurité.
              </div>
            ) : (
              [...(metrics?.produitsEnRupture || []), ...(metrics?.produitsEnAlerte || [])].slice(0, 5).map((p: any) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                >
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">{p.nom_commercial}</div>
                    <div className="text-xs text-slate-500">
                      DCI: {p.dci} • Forme: {p.forme_galenique} {p.dosage}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                      Seuil alerte: {p.stock_minimum_alerte}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Raccourcis Métiers Officine */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
        <Link
          to="/dashboard/pharmacie/catalogue"
          className="p-4 bg-white dark:bg-slate-800 hover:border-emerald-500 transition rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-3"
        >
          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 rounded-lg">
            <Pill className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">Catalogue & DCI</div>
            <div className="text-xs text-slate-500">Tableaux & fiches</div>
          </div>
        </Link>

        <Link
          to="/dashboard/pharmacie/lots"
          className="p-4 bg-white dark:bg-slate-800 hover:border-emerald-500 transition rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-3"
        >
          <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 text-amber-600 rounded-lg">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">Lots & Péremptions</div>
            <div className="text-xs text-slate-500">Principe FEFO strict</div>
          </div>
        </Link>

        <Link
          to="/dashboard/pharmacie/vigilance"
          className="p-4 bg-white dark:bg-slate-800 hover:border-emerald-500 transition rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-3"
        >
          <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 rounded-lg">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">Rappels & Vigilance</div>
            <div className="text-xs text-slate-500">Blocage & traçabilité</div>
          </div>
        </Link>

        <Link
          to="/dashboard/pharmacie/inventaires"
          className="p-4 bg-white dark:bg-slate-800 hover:border-emerald-500 transition rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-3"
        >
          <div className="p-2.5 bg-purple-50 dark:bg-purple-950/40 text-purple-600 rounded-lg">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">Multi-Dépôts & Frigo</div>
            <div className="text-xs text-slate-500">Transferts & inventaires</div>
          </div>
        </Link>
      </div>
    </div>
  )
}
