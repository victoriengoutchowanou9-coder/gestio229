// =============================================================================
// GESTIO 229 SaaS — Header : Barre supérieure du dashboard
// =============================================================================

import React from 'react'
import { useLocation, Link } from 'react-router-dom'
import { Menu, Bell, ChevronRight, ArrowLeft, Sun, Moon } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'
import clsx from 'clsx'

// Mapping route → titre de page
const PAGE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  'tableau-bord':  { title: 'Tableau de bord', subtitle: 'Aperçu du secteur en direct' },
  'vente-pos':     { title: 'Vente & POS', subtitle: 'Point de vente & encaissement' },
  'stocks':        { title: 'Stocks & Inventaire', subtitle: 'Gestion des dépôts & inventaires' },
  'caisse':        { title: 'Caisse', subtitle: 'Sessions & clôtures de caisse' },
  'tresorerie':    { title: 'Trésorerie', subtitle: 'Liquidités, banques & décaissements' },
  'clients':       { title: 'Clients & Créances', subtitle: 'Gestion des comptes clients' },
  'fournisseurs':  { title: 'Achats & Fournisseurs', subtitle: 'Bons de commande & réceptions' },
  'depenses':      { title: 'Dépenses', subtitle: 'Saisie et suivi des charges' },
  'reporting':     { title: 'Rapports & Analyses', subtitle: 'Indicateurs de performance' },
  'syscohada':     { title: 'Comptabilité SYSCOHADA', subtitle: 'Journal & grand livre' },
  'configuration': { title: 'Configuration', subtitle: 'Paramètres entreprise & fiscalité' },
  'journal-audit': { title: "Journal d'Audit", subtitle: 'Traçabilité des opérations' },
  'abonnement':    { title: 'Mon Abonnement', subtitle: 'Gestion de l\'offre' },
  'utilisateurs':  { title: 'Gestion des Utilisateurs', subtitle: 'Équipe, rôles & permissions' },
}

const Header: React.FC = () => {
  const location = useLocation()
  const company = useAuthStore((s) => s.company)
  const notifications = useUIStore((s) => s.notifications)
  const toggleMobileSidebar = useUIStore((s) => s.toggleMobileSidebar)
  const { darkMode, toggleDarkMode } = useUIStore()

  // Extraire le module actif depuis la route
  const parts = location.pathname.split('/')
  const activeRoute = parts[2] ?? ''
  const pageInfo = PAGE_TITLES[activeRoute] ?? { title: 'Tableau de bord' }

  return (
    <header className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
      {/* Burger mobile */}
      <button
        onClick={toggleMobileSidebar}
        className="lg:hidden p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Bouton Retour au HUB Exigé par le CDC (visible PC, tablette et mobile) */}
      <Link
        to="/hub"
        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-sm shrink-0"
        title="Revenir au HUB multi-secteurs de GESTIO 229"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">← Retour au HUB</span>
        <span className="sm:hidden">HUB</span>
      </Link>

      {/* Breadcrumb */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-0.5">
          <span className="truncate max-w-[120px] font-semibold text-slate-600">{company?.name ?? 'Entreprise'}</span>
          <ChevronRight className="w-3 h-3 flex-shrink-0" />
          <span className="text-slate-800 font-bold truncate">{pageInfo.title}</span>
        </div>
        {pageInfo.subtitle && (
          <p className="text-xs text-slate-400 hidden md:block">{pageInfo.subtitle}</p>
        )}
      </div>

      {/* Actions droite */}
      <div className="flex items-center gap-2">
        {/* Sélecteur Thème Clair / Sombre */}
        <button
          onClick={toggleDarkMode}
          className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition flex items-center gap-1.5 text-xs font-bold"
          title={darkMode ? 'Basculer en Thème Clair' : 'Basculer en Thème Sombre'}
        >
          {darkMode ? (
            <>
              <Sun className="w-4 h-4 text-amber-500" />
              <span className="hidden lg:inline text-slate-700">Clair</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-slate-600" />
              <span className="hidden lg:inline text-slate-700">Sombre</span>
            </>
          )}
        </button>

        {/* Statut abonnement */}
        {company?.subscription_status && (
          <span className={clsx(
            'hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
            company.subscription_status === 'active'
              ? 'bg-emerald-100 text-emerald-700'
              : company.subscription_status === 'trial'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-red-100 text-red-700'
          )}>
            <span className={clsx(
              'w-1.5 h-1.5 rounded-full',
              company.subscription_status === 'active' ? 'bg-emerald-500' :
              company.subscription_status === 'trial' ? 'bg-amber-500' : 'bg-red-500'
            )} />
            {company.subscription_status === 'active' ? 'Actif' :
             company.subscription_status === 'trial' ? 'Essai' : 'Expiré'}
          </span>
        )}

        {/* Notifications */}
        <button className="relative p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition">
          <Bell className="w-5 h-5" />
          {notifications.length > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
          )}
        </button>
      </div>
    </header>
  )
}

export default Header
