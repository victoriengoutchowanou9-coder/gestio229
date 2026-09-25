// =============================================================================
// GESTIO 229 SaaS — Sidebar : Navigation 14 modules dynamiques
// =============================================================================

import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  ShoppingCart, Package, Landmark, Users, Truck, Receipt,
  BarChart3, ClipboardList, Shield, CreditCard, Settings,
  BookOpen, ChevronLeft, ChevronRight, LogOut, Store,
  X, Wallet, Building2
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'
import { GROUP_ORDER, GROUP_LABELS } from '../../core/modules/moduleRegistry'
import SectorLoader from '../../lib/SectorLoader'
import clsx from 'clsx'

// ─── Map icônes ─────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.FC<any>> = {
  ShoppingCart, Package, Landmark, Users, Truck, Receipt,
  BarChart3, ClipboardList, Shield, CreditCard, Settings,
  BookOpen, Wallet, Building2, Store,
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
            : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
        )
      }
      title={collapsed ? label : undefined}
    >
      {({ isActive }) => (
        <>
          <span className="flex-shrink-0">
            <DynamicIcon
              name={icon}
              className={clsx('w-5 h-5', isActive ? 'text-white' : 'text-slate-500 group-hover:text-emerald-600')}
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
  const { company, user, logout } = useAuthStore()
  const { sidebarCollapsed, sidebarMobileOpen, toggleSidebar } = useUIStore()

  // Construire la nav dynamiquement
  const { grouped, flat } = SectorLoader.getDefaultNav()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <aside
      className={clsx(
        'flex flex-col bg-white border-r border-slate-200 transition-all duration-300 z-30',
        // Desktop
        sidebarCollapsed ? 'w-16' : 'w-64',
        // Mobile
        'fixed lg:relative lg:translate-x-0',
        sidebarMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        'h-full'
      )}
    >
      {/* ── Logo & Entreprise ──────────────────────────────────────── */}
      <div className={clsx(
        'flex items-center border-b border-slate-100 flex-shrink-0',
        sidebarCollapsed ? 'p-3 justify-center' : 'p-4 gap-3'
      )}>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm">G</span>
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">
              {company?.name ?? 'GESTIO 229'}
            </p>
            <p className="text-xs text-emerald-600 font-medium">SaaS V3.0</p>
          </div>
        )}
      </div>

      {/* ── Navigation ────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {GROUP_ORDER.map((groupKey) => {
          const items = grouped[groupKey]
          if (!items?.length) return null
          return (
            <div key={groupKey} className="mb-2">
              {!sidebarCollapsed && (
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 px-3 py-1.5">
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
      <div className="border-t border-slate-100 p-3 flex-shrink-0 space-y-1">
        {/* Bouton collapse desktop */}
        <button
          onClick={toggleSidebar}
          className="hidden lg:flex w-full items-center justify-center p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          title={sidebarCollapsed ? 'Agrandir' : 'Réduire'}
        >
          {sidebarCollapsed
            ? <ChevronRight className="w-4 h-4" />
            : <ChevronLeft className="w-4 h-4" />
          }
        </button>

        {/* Profil utilisateur */}
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2 px-2 py-2 rounded-xl bg-slate-50">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <span className="text-emerald-700 font-bold text-xs">
                {user?.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700 truncate">{user?.full_name ?? 'Utilisateur'}</p>
              <p className="text-[10px] text-slate-400 truncate capitalize">{user?.role ?? 'Caissier'}</p>
            </div>
          </div>
        )}

        {/* Déconnexion */}
        <button
          onClick={handleLogout}
          className={clsx(
            'flex items-center gap-2 w-full p-2 rounded-xl text-sm text-slate-500 hover:bg-red-50 hover:text-red-600 transition',
            sidebarCollapsed ? 'justify-center' : ''
          )}
          title="Se déconnecter"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!sidebarCollapsed && <span>Déconnexion</span>}
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
