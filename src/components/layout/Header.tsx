// =============================================================================
// GESTIO 229 SaaS — Header Pro Style Standalone
// Conforme Spécifications : Fond clair #f5f5f0, Palette Vert/Blanc GESTIO 229
// Ligne 1 : Logo GESTIO 229, Pill HUB CENTRAL, Thème, Pill Caisse | Bonjour, [Entreprise]
// Ligne 2 : Titre avec icône, X sites · Y secteurs, Quota
// =============================================================================

import React, { useState, useEffect } from 'react'
import { useLocation, Link, useNavigate } from 'react-router-dom'
import {
  Menu,
  Wallet,
  LayoutDashboard,
  ShoppingCart,
  Package,
  Landmark,
  Users,
  Truck,
  Receipt,
  BarChart3,
  BookOpen,
  Settings,
  Shield,
  CreditCard,
  Building2,
  Moon,
  Sun,
  Layers,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'
import { useTheme } from '../../context/ThemeContext'
import { getActiveSectorMeta } from '../../lib/sectorClient'
import { getCompanySubscriptionInfo } from '../../core/subscription/subscriptionEngine'
import { supabase } from '../../lib/supabase'
import { useTenant } from '../../hooks/useTenant'

// Mapping route → titre de page & icône
const PAGE_CONFIGS: Record<string, { title: string; icon: React.FC<{ className?: string }> }> = {
  'tableau-bord':  { title: 'Tableau de bord', icon: LayoutDashboard },
  'dashboard':     { title: 'Tableau de bord', icon: LayoutDashboard },
  'vente-pos':     { title: 'Point de Vente & POS', icon: ShoppingCart },
  'ventes':        { title: 'Ventes Commerciales', icon: ShoppingCart },
  'stocks':        { title: 'Stocks & Inventaires', icon: Package },
  'caisse':        { title: 'Caisse & Clôtures', icon: Wallet },
  'cloture-caisse':{ title: 'Clôture de Caisse', icon: Wallet },
  'tresorerie':    { title: 'Trésorerie & Banque', icon: Landmark },
  'clients':       { title: 'Clients & Créances', icon: Users },
  'fournisseurs':  { title: 'Achats & Fournisseurs', icon: Truck },
  'achats':        { title: 'Achats & Fournisseurs', icon: Truck },
  'depenses':      { title: 'Dépenses & Charges', icon: Receipt },
  'reporting':     { title: 'Rapports & Rentabilité', icon: BarChart3 },
  'rapports':      { title: 'Rapports & Rentabilité', icon: BarChart3 },
  'syscohada':     { title: 'Comptabilité SYSCOHADA', icon: BookOpen },
  'configuration': { title: 'Configuration Entreprise', icon: Settings },
  'journal-audit': { title: "Journal d'Audit", icon: Shield },
  'audit':         { title: "Journal d'Audit", icon: Shield },
  'abonnement':    { title: 'Mon Abonnement', icon: CreditCard },
  'utilisateurs':  { title: 'Gestion Utilisateurs', icon: Users },
}

const Header: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const company = useAuthStore((s) => s.company)
  const user = useAuthStore((s) => s.user)
  const toggleMobileSidebar = useUIStore((s) => s.toggleMobileSidebar)
  const { toggle, isClair } = useTheme()
  const { sectorSlug } = useTenant()
  const sectorMeta = getActiveSectorMeta(sectorSlug)

  // Calcul du nombre de secteurs & sites réels
  const rawSectors = (company as any)?.selected_sectors || (company as any)?.sectors || []
  const sectorsCount = Math.max(1, Array.isArray(rawSectors) && rawSectors.length > 0 ? rawSectors.length : 1)
  const sitesCount = 1

  // Quota & statut abonnement
  const isExpired = company?.subscription_status === 'expired'
  const isTrial = company?.subscription_status === 'trial' || !company?.subscription_status
  const quotaLabel = isExpired ? 'Expiré' : isTrial ? 'Essai Pro' : 'Illimité'

  // Route & Métadonnées actives
  const parts = location.pathname.split('/').filter(Boolean)
  const activeRoute = parts[parts.length - 1] || 'tableau-bord'
  const pageConfig = PAGE_CONFIGS[activeRoute] ?? { title: 'Tableau de bord', icon: LayoutDashboard }
  const PageIcon = pageConfig.icon

  // Lien direct vers la Caisse du secteur actif
  const cleanSectorSlug = sectorSlug ? String(sectorSlug).replace(/^sec-/, '').toLowerCase() : 'boutique'
  const caisseLink = `/app/${cleanSectorSlug}/caisse`

  const companyDisplayName = (company?.name || 'ENTREPRISE').toUpperCase()

  return (
    <header className="w-full shrink-0 select-none transition-colors duration-200 border-b border-[#e5e5dc] dark:border-slate-800 bg-[#f5f5f0] dark:bg-slate-900">
      {/* ══════════════════════════════════════════════════════════════════════
          LIGNE 1 : Navigation Pill Pro & Identité Entreprise
          Logo GESTIO 229 | HUB CENTRAL | Thème | Caisse  ┈┈┈┈┈  Bonjour, [Entreprise]
         ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 gap-2 sm:gap-4">
        {/* ── Gauche : Contrôles & Boutons Pill Pro ── */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 flex-nowrap overflow-x-auto no-scrollbar py-0.5">
          {/* Burger mobile */}
          <button
            onClick={toggleMobileSidebar}
            className="lg:hidden p-1.5 rounded-full text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition shrink-0"
            title="Menu latéral"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo GESTIO 229 (remplace la couronne) */}
          <Link
            to="/hub"
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center text-white shadow-sm transition shrink-0 overflow-hidden"
            title="GESTIO 229 — Accueil"
          >
            <img src="/icon-192.png" alt="GESTIO 229" className="w-5 h-5 sm:w-6 sm:h-6 object-contain rounded-sm" />
          </Link>

          {/* Pill "HUB CENTRAL" (remplace GOLD HUB) - Fond vert GESTIO 229 + texte blanc */}
          <Link
            to="/hub"
            className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs sm:text-xs tracking-wide px-3.5 sm:px-4 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm transition shrink-0 uppercase"
            title="Revenir au HUB multi-secteurs de GESTIO 229"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span>HUB CENTRAL</span>
          </Link>

          {/* Bouton Thème Sombre / Clair (Pill blanc arrondi) */}
          <button
            onClick={toggle}
            type="button"
            className="bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-xs transition shrink-0"
            title={isClair ? 'Basculer en mode Sombre' : 'Basculer en mode Clair'}
          >
            {isClair ? (
              <>
                <Moon className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                <span className="hidden md:inline">Sombre</span>
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden md:inline">Clair</span>
              </>
            )}
          </button>

          {/* Pill "Caisse" avec icône (Pill blanc arrondi) */}
          <Link
            to={caisseLink}
            className="bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700 px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-xs transition shrink-0"
            title="Accéder rapidement à la Caisse"
          >
            <Wallet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Caisse</span>
          </Link>
        </div>

        {/* ── Droite : Bonjour, NOM DE L'ENTREPRISE ── */}
        <div className="flex items-center gap-1.5 text-right shrink-0">
          <span className="hidden sm:inline text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
            Bonjour,
          </span>
          <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight truncate max-w-[130px] sm:max-w-[240px] md:max-w-[320px]">
            {companyDisplayName}
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          LIGNE 2 : Titre Page & Métadonnées Métier
          [Icône] Tableau de bord  ┈┈┈┈┈  X sites · Y secteurs  |  Quota : ...
         ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-3 sm:px-5 py-2 border-t border-[#e8e8df] dark:border-slate-800/80 bg-[#ebebe5] dark:bg-slate-900/90 gap-1.5 sm:gap-3">
        {/* Titre avec Icône + Secteur */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-emerald-600/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <PageIcon className="w-4 h-4" />
          </div>
          <h1 className="text-sm sm:text-base font-black text-slate-900 dark:text-white tracking-tight truncate">
            {pageConfig.title}
          </h1>
          {sectorMeta?.name && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-600/10 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-600/20 dark:border-emerald-500/30 truncate shrink-0 hidden xs:inline-block">
              {sectorMeta.name}
            </span>
          )}
        </div>

        {/* Sous-titre : X sites · Y secteurs et Quota */}
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 flex-wrap">
          <span className="bg-white/90 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200/80 dark:border-slate-700 text-[11px] sm:text-xs text-slate-700 dark:text-slate-200 shadow-2xs">
            {sitesCount} site{sitesCount > 1 ? 's' : ''} · {sectorsCount} secteur{sectorsCount > 1 ? 's' : ''}
          </span>
          <span className="bg-emerald-100/90 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300/70 dark:border-emerald-800 px-3 py-1 rounded-full text-[11px] sm:text-xs font-bold shadow-2xs">
            Quota : {quotaLabel}
          </span>
        </div>
      </div>
    </header>
  )
}

export default Header
