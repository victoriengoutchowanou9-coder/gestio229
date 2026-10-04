// =============================================================================
// GESTIO 229 SaaS — Sidebar : Navigation 14 modules dynamiques avec filtrage RBAC
// =============================================================================

import React, { useState } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import {
  ShoppingCart, Package, Package2, Landmark, Users, Truck, Receipt,
  BarChart3, ClipboardList, Shield, CreditCard, Settings,
  BookOpen, ChevronLeft, ChevronRight, LogOut, Store,
  Wallet, Building2, KeyRound, LayoutDashboard,
  // Sector-specific icons
  GraduationCap, Car, Wrench, BedDouble, PiggyBank, Scale, Tag, Fuel,
  Home, UserCog, Droplets, Snowflake, Layers, Calculator, Calendar,
  Sparkles, RefreshCw, UserCheck, FileText, AlertTriangle, Fish,
  Scissors, Banknote, Sprout, Wine, Utensils, Printer, GitFork,
  FileCheck, FileSignature, AlertOctagon, Grid2X2, Hammer
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'
import { GROUP_ORDER, GROUP_LABELS } from '../../core/modules/moduleRegistry'
import SectorLoader from '../../lib/SectorLoader'
import { getActiveSectorMeta } from '../../lib/sectorClient'
import { ProfileModal } from '../auth/ProfileModal'
import clsx from 'clsx'

// ─── Map icônes ─────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.FC<any>> = {
  LayoutDashboard, ShoppingCart, Package, Package2, Landmark, Users, Truck, Receipt,
  BarChart3, ClipboardList, Shield, CreditCard, Settings,
  BookOpen, Wallet, Building2, Store,
  // Sector-specific icons
  GraduationCap, Car, Wrench, BedDouble, PiggyBank, Scale, Tag, Fuel,
  Home, UserCog, Droplets, Snowflake, Layers, Calculator, Calendar,
  Sparkles, RefreshCw, UserCheck, FileText, AlertTriangle, Fish,
  Scissors, Banknote, Sprout, Wine, Utensils, Printer, GitFork,
  FileCheck, FileSignature, AlertOctagon, Hammer,
  Grid: Grid2X2,
}

const DynamicIcon: React.FC<{ name: string; className?: string }> = ({ name, className }) => {
  const Icon = ICON_MAP[name] ?? Store
  return <Icon className={className ?? 'w-5 h-5'} />
}

// ─── Nav Item ────────────────────────────────────────────────────────────────

interface NavItemProps {
  href: string
  label: string
  icon: string
  collapsed: boolean
}

const SidebarNavItem: React.FC<NavItemProps> = ({ href, label, icon, collapsed }) => {
  return (
    <NavLink
      to={href}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group',
          isActive
            ? 'bg-emerald-600 text-white shadow-sm'
            : 'text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-slate-800 hover:text-emerald-700 dark:hover:text-emerald-400'
        )
      }
      title={collapsed ? label : undefined}
    >
      {({ isActive }) => (
        <>
          <span className="flex-shrink-0">
            <DynamicIcon
              name={icon}
              className={clsx('w-5 h-5', isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400')}
            />
          </span>
          {!collapsed && (
            <span className="truncate">{label}</span>
          )}
        </>
      )}
    </NavLink>
  )
}

// ─── Sidebar principale ──────────────────────────────────────────────────────

const Sidebar: React.FC = () => {
  const navigate = useNavigate()
  const params = useParams<{ sectorSlug?: string }>()
  const { company, user, logout } = useAuthStore()
  const { sidebarCollapsed, sidebarMobileOpen, toggleSidebar } = useUIStore()
  const [profileModalOpen, setProfileModalOpen] = useState(false)

  const currentSectorSlug = params.sectorSlug || localStorage.getItem('gestio229_active_sector') || undefined
  const sectorMeta = getActiveSectorMeta()

  // Construire la nav dynamiquement pour le sous-logiciel actif
  const { grouped } = SectorLoader.getDefaultNav(currentSectorSlug)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <>
      <aside
        className={clsx(
          'flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 z-30',
          // Desktop
          sidebarCollapsed ? 'w-16' : 'w-64',
          // Mobile
          'fixed lg:relative lg:translate-x-0',
          sidebarMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          'h-full'
        )}
      >
        {/* ── Logo & Entreprise & Badge Sous-logiciel ────────────────── */}
        <div className={clsx(
          'flex flex-col border-b border-slate-100 dark:border-slate-800 flex-shrink-0',
          sidebarCollapsed ? 'p-3 items-center' : 'p-4 gap-2'
        )}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center flex-shrink-0 shadow-sm">
              <span className="text-white font-bold text-sm">G</span>
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                  {company?.name ?? 'GESTIO 229'}
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">SaaS Multi-Secteurs</p>
              </div>
            )}
          </div>
          {!sidebarCollapsed && sectorMeta && (
            <div className="mt-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-slate-800 flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-slate-700">
              <span className="text-base">{sectorMeta.emoji || '🏢'}</span>
              <span className="truncate">{sectorMeta.name}</span>
            </div>
          )}
        </div>

        {/* ── Navigation avec filtrage des permissions et de l'abonnement ──────────────── */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {GROUP_ORDER.map((groupKey) => {
            const rawItems = grouped[groupKey] ?? []
            // Filtrage selon les droits réels définis pour l'utilisateur et son abonnement
            const items = rawItems.filter((item) => SectorLoader.canAccess(user, item.id, 'view', company))
            if (!items.length) return null

            return (
              <div key={groupKey} className="mb-2">
                {!sidebarCollapsed && (
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 px-3 py-1.5">
                    {GROUP_LABELS[groupKey] ?? groupKey}
                  </p>
                )}
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <SidebarNavItem
                      key={item.id}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      collapsed={sidebarCollapsed}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        {/* ── User footer ────────────────────────────────────────────── */}
        <div className="border-t border-slate-100 dark:border-slate-800 p-3 flex-shrink-0 space-y-1">
          {/* Bouton collapse desktop */}
          <button
            onClick={toggleSidebar}
            className="hidden lg:flex w-full items-center justify-center p-2 rounded-xl text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition"
            title={sidebarCollapsed ? 'Agrandir' : 'Réduire'}
          >
            {sidebarCollapsed
              ? <ChevronRight className="w-4 h-4" />
              : <ChevronLeft className="w-4 h-4" />
            }
          </button>

          {/* Profil utilisateur & Modification identifiants */}
          <button
            onClick={() => setProfileModalOpen(true)}
            className={clsx(
              'flex items-center gap-2 w-full p-2 rounded-xl text-left transition',
              'bg-slate-50 dark:bg-slate-800/80 hover:bg-emerald-50 dark:hover:bg-slate-700/80 hover:border-emerald-200 border border-transparent group',
              sidebarCollapsed ? 'justify-center' : ''
            )}
            title="Modifier mes identifiants & mot de passe"
          >
            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/60 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-200">
              <span className="text-emerald-700 dark:text-emerald-300 font-bold text-xs">
                {user?.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
              </span>
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate group-hover:text-emerald-800 dark:group-hover:text-emerald-300">
                  {user?.full_name ?? 'Utilisateur'}
                </p>
                <div className="flex items-center gap-1">
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate capitalize">{user?.role ?? 'Utilisateur'}</p>
                  <KeyRound className="w-2.5 h-2.5 text-slate-400 group-hover:text-emerald-600 ml-auto" />
                </div>
              </div>
            )}
          </button>

          {/* Déconnexion */}
          <button
            onClick={handleLogout}
            className={clsx(
              'flex items-center gap-2 w-full p-2 rounded-xl text-sm text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 transition',
              sidebarCollapsed ? 'justify-center' : ''
            )}
            title="Se déconnecter"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!sidebarCollapsed && <span>Déconnexion</span>}
          </button>
        </div>
      </aside>

      {/* Modal de profil et identifiants */}
      <ProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
      />
    </>
  )
}

export default Sidebar
