// =============================================================================
// GESTIO 229 ADMIN — Dashboard Principal Super Admin
// Statistiques globales, graphiques, aperçu de la plateforme
// =============================================================================

import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAdminStats, useAdminFinances } from '../../hooks/useAdminData'
import {
  Building2, CheckCircle2, XCircle, Clock, AlertTriangle,
  DollarSign, Users, Store, TrendingUp, Eye, RefreshCw
} from 'lucide-react'

// ─── Formatage monétaire ─────────────────────────────────────────────────
function formatFCFA(n: number = 0): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' FCFA'
}

// ─── Carte Statistique ─────────────────────────────────────────────────────
interface StatCardProps {
  icon: React.ElementType
  label: string
  value: string | number
  subLabel?: string
  color: string
  bgColor: string
  href?: string
  trend?: string
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, label, value, subLabel, color, bgColor, href, trend }) => {
  const content = (
    <div className={`rounded-2xl border border-slate-800 bg-slate-900 p-5 hover:border-slate-700 transition group`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-11 h-11 rounded-xl ${bgColor} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        {trend && (
          <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            {trend}
          </span>
        )}
      </div>
      <p className="text-slate-400 text-xs font-medium mb-1">{label}</p>
      <p className="text-white text-2xl font-black">{value}</p>
      {subLabel && <p className="text-slate-500 text-xs mt-1">{subLabel}</p>}
    </div>
  )

  if (href) return <Link to={href}>{content}</Link>
  return content
}

// ─── Barre de progression simple ──────────────────────────────────────────
const ProgressBar: React.FC<{ value: number; max: number; color: string; label: string }> = ({ value, max, color, label }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs text-slate-400 mb-1">
        <span>{label}</span>
        <span className="font-semibold text-white">{value}</span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ─── Dashboard Principal ───────────────────────────────────────────────────
const AdminDashboard: React.FC = () => {
  const { data: stats, loading: statsLoading, error: statsError, reload: reloadStats } = useAdminStats()
  const { data: finances, loading: financesLoading } = useAdminFinances('month')

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Chargement du tableau de bord...</p>
        </div>
      </div>
    )
  }

  if (statsError) {
    return (
      <div className="text-center py-16">
        <p className="text-red-400 mb-4">{statsError}</p>
        <button onClick={reloadStats} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-500 transition">
          Réessayer
        </button>
      </div>
    )
  }

  const s = stats || {}
  const totalCompanies = s.totalCompanies || 0

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-black">Tableau de bord</h1>
          <p className="text-slate-400 text-sm mt-1">Vue globale de la plateforme GESTIO 229</p>
        </div>
        <button
          onClick={reloadStats}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl text-sm font-medium transition border border-slate-700"
        >
          <RefreshCw className="w-4 h-4" />
          Actualiser
        </button>
      </div>

      {/* Grille statistiques */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard
          icon={Building2}
          label="Entreprises inscrites"
          value={s.totalCompanies || 0}
          subLabel="Nombre total de comptes"
          color="text-blue-400"
          bgColor="bg-blue-900/30"
          href="/admin/companies"
        />
        <StatCard
          icon={CheckCircle2}
          label="Entreprises actives"
          value={s.activeCompanies || 0}
          subLabel="Abonnement actif payé"
          color="text-emerald-400"
          bgColor="bg-emerald-900/30"
          href="/admin/companies?filter=active"
        />
        <StatCard
          icon={Clock}
          label="Périodes d'essai"
          value={s.trialCompanies || 0}
          subLabel="En cours d'essai 30 jours"
          color="text-orange-400"
          bgColor="bg-orange-900/30"
          href="/admin/companies?filter=trial"
        />
        <StatCard
          icon={XCircle}
          label="Entreprises inactives"
          value={s.inactiveCompanies || 0}
          subLabel="Expirées ou suspendues"
          color="text-red-400"
          bgColor="bg-red-900/30"
          href="/admin/companies?filter=inactive"
        />
        <StatCard
          icon={AlertTriangle}
          label="Expirant bientôt"
          value={s.expiringTrials || 0}
          subLabel="Dans les 7 prochains jours"
          color="text-yellow-400"
          bgColor="bg-yellow-900/30"
          href="/admin/subscriptions?filter=expiring"
        />
      </div>

      {/* Ligne revenus */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={DollarSign}
          label="Revenus du jour"
          value={formatFCFA(s.revenusJour || 0)}
          subLabel="Ventes enregistrées aujourd'hui"
          color="text-emerald-400"
          bgColor="bg-emerald-900/30"
          href="/admin/finances"
        />
        <StatCard
          icon={DollarSign}
          label="Revenus du mois"
          value={formatFCFA(s.revenusMois || 0)}
          subLabel="Mois en cours"
          color="text-emerald-400"
          bgColor="bg-emerald-900/30"
          href="/admin/finances"
        />
        <StatCard
          icon={DollarSign}
          label="Revenus de l'année"
          value={formatFCFA(s.revenusAnnee || 0)}
          subLabel="Année en cours cumulée"
          color="text-emerald-400"
          bgColor="bg-emerald-900/30"
          href="/admin/finances"
        />
      </div>

      {/* Ligne autres */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard
          icon={Users}
          label="Nombre total d'utilisateurs"
          value={s.totalUsers || 0}
          subLabel="Administrateurs + Utilisateurs internes"
          color="text-purple-400"
          bgColor="bg-purple-900/30"
          href="/admin/companies"
        />
        <StatCard
          icon={Store}
          label="Secteurs d'activités utilisés"
          value={s.totalSectors || 0}
          subLabel="Secteurs distincts parmi les entreprises"
          color="text-cyan-400"
          bgColor="bg-cyan-900/30"
          href="/admin/sectors"
        />
      </div>

      {/* Répartition des statuts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-400" />
            Répartition des entreprises
          </h3>
          <ProgressBar value={s.activeCompanies || 0} max={totalCompanies} color="bg-emerald-500" label="🟢 Actives" />
          <ProgressBar value={s.trialCompanies || 0} max={totalCompanies} color="bg-orange-500" label="🟠 En essai" />
          <ProgressBar value={s.expiredCompanies || 0} max={totalCompanies} color="bg-red-500" label="🔴 Expirées" />
          <ProgressBar value={s.suspendedCompanies || 0} max={totalCompanies} color="bg-slate-500" label="⚫ Suspendues" />
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            Aperçu des revenus (mois)
          </h3>
          {financesLoading ? (
            <div className="text-slate-400 text-sm">Chargement...</div>
          ) : finances ? (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Revenus abonnements</span>
                <span className="text-emerald-400 font-bold text-sm">{formatFCFA(finances.totalRevenue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Transactions</span>
                <span className="text-white font-semibold text-sm">{finances.transactionCount || 0}</span>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-800">
                <p className="text-slate-500 text-xs">
                  Les revenus représentent les ventes enregistrées dans le système de caisse. 
                  Les dépenses de la plateforme seront ajoutées ultérieurement.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Raccourcis actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Voir les entreprises', href: '/admin/companies', color: 'from-blue-600 to-blue-700' },
          { label: 'Gérer abonnements', href: '/admin/subscriptions', color: 'from-emerald-600 to-emerald-700' },
          { label: 'Avis & Suggestions', href: '/admin/feedbacks', color: 'from-orange-600 to-orange-700' },
          { label: "Journal d'audit", href: '/admin/audit', color: 'from-purple-600 to-purple-700' },
        ].map(({ label, href, color }) => (
          <Link
            key={href}
            to={href}
            className={`bg-gradient-to-br ${color} hover:opacity-90 text-white text-center font-bold py-3 px-4 rounded-xl text-sm transition shadow-md`}
          >
            {label}
          </Link>
        ))}
      </div>
    </div>
  )
}

export default AdminDashboard
