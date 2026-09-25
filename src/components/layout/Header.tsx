// =============================================================================
// GESTIO 229 SaaS — Header : Barre supérieure du dashboard
// =============================================================================

import React from 'react'
import { useLocation } from 'react-router-dom'
import { Menu, Bell, Search, ChevronRight } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'
import clsx from 'clsx'

// Mapping route → titre de page
const PAGE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  'vente-pos':     { title: 'Ventes & Caisse POS', subtitle: 'Point de vente' },
  'stocks':        { title: 'Stock & Inventaire', subtitle: 'Gestion des produits' },
  'caisse':        { title: 'Caisse', subtitle: 'Sessions de caisse' },
  'tresorerie':    { title: 'Trésorerie', subtitle: 'Caisses & banques' },
  'clients':       { title: 'Clients & Créances', subtitle: 'Gestion des clients' },
  'fournisseurs':  { title: 'Fournisseurs & Achats', subtitle: 'Gestion des fournisseurs' },
  'depenses':      { title: 'Dépenses', subtitle: 'Saisie des charges' },
  'reporting':     { title: 'Rapports & Analyses', subtitle: 'Tableaux de bord' },
  'syscohada':     { title: 'Comptabilité SYSCOHADA', subtitle: 'Journal & grand livre' },
  'configuration': { title: 'Configuration', subtitle: 'Paramètres entreprise' },
  'journal-audit': { title: "Journal d'Audit", subtitle: 'Traçabilité des actions' },
  'abonnement':    { title: 'Mon Abonnement', subtitle: 'Gestion & renouvellement' },
}

const Header: React.FC = () => {
  const location = useLocation()
  const company = useAuthStore((s) => s.company)
  const notifications = useUIStore((s) => s.notifications)
  const toggleMobileSidebar = useUIStore((s) => s.toggleMobileSidebar)

  // Extraire le module actif depuis la route
  const parts = location.pathname.split('/')
  const activeRoute = parts[2] ?? ''
  const pageInfo = PAGE_TITLES[activeRoute] ?? { title: 'Dashboard' }

  return (
    <header className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-4">
      {/* Burger mobile */}
      <button
        onClick={toggleMobileSidebar}
        className="lg:hidden p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Breadcrumb */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-0.5">
          <span className="truncate max-w-[120px]">{company?.name ?? 'Entreprise'}</span>
          <ChevronRight className="w-3 h-3 flex-shrink-0" />
          <span className="text-slate-600 font-medium">{pageInfo.title}</span>
        </div>
        {pageInfo.subtitle && (
          <p className="text-xs text-slate-400 hidden sm:block">{pageInfo.subtitle}</p>
        )}
      </div>

      {/* Actions droite */}
      <div className="flex items-center gap-2">
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
