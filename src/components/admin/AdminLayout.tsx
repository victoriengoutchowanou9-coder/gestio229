// =============================================================================
// GESTIO 229 ADMIN — Layout Principal du Back-Office Super Admin
// Sidebar + Header + Contenu + Protection de route
// =============================================================================

import React, { useEffect, useState } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAdminStore } from '../../store/adminStore'
import { useAdminFeedbacksCount } from '../../hooks/useAdminData'
import {
  LayoutDashboard, Building2, CreditCard, DollarSign, BarChart3,
  Store, MessageSquare, ClipboardList, Settings, LogOut, Shield,
  Bell, ChevronLeft, ChevronRight, Menu, X
} from 'lucide-react'

// ─── Menu Latéral ─────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/admin/dashboard', key: 'dashboard' },
  { icon: Building2, label: 'Gestion des entreprises', href: '/admin/companies', key: 'companies' },
  { icon: CreditCard, label: 'Abonnements', href: '/admin/subscriptions', key: 'subscriptions' },
  { icon: DollarSign, label: 'Finances', href: '/admin/finances', key: 'finances' },
  { icon: BarChart3, label: 'Statistiques', href: '/admin/stats', key: 'stats' },
  { icon: Store, label: "Secteurs d'activités", href: '/admin/sectors', key: 'sectors' },
  { icon: MessageSquare, label: 'Avis & Suggestions', href: '/admin/feedbacks', key: 'feedbacks', badge: true },
  { icon: ClipboardList, label: "Journal d'audit", href: '/admin/audit', key: 'audit' },
  { icon: Settings, label: 'Paramètres', href: '/admin/settings', key: 'settings' },
]

// ─── Guard Admin Route ─────────────────────────────────────────────────────
export const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate()
  const { isAuthenticated, checkSession } = useAdminStore()

  useEffect(() => {
    if (!isAuthenticated || !checkSession()) {
      navigate('/admin/login', { replace: true })
    }
  }, [isAuthenticated, checkSession, navigate])

  if (!isAuthenticated) return null
  return <>{children}</>
}

// ─── Layout Admin ─────────────────────────────────────────────────────────
const AdminLayout: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { logout } = useAdminStore()
  const newFeedbacksCount = useAdminFeedbacksCount()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/admin/login', { replace: true })
  }

  const isActive = (href: string) =>
    href === '/admin/dashboard'
      ? location.pathname === href
      : location.pathname.startsWith(href)

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Logo */}
      <div className={`flex items-center gap-3 border-b border-slate-700 ${collapsed ? 'p-3 justify-center' : 'p-4'}`}>
        <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
          <Shield className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div>
            <p className="text-white font-black text-sm tracking-tight">GESTIO 229 ADMIN</p>
            <p className="text-emerald-400 text-xs font-medium">Super Administrateur</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ icon: Icon, label, href, key, badge }) => {
          const active = isActive(href)
          return (
            <Link
              key={key}
              to={href}
              onClick={() => setMobileOpen(false)}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative ${
                active
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
              {!collapsed && <span className="text-sm font-medium truncate">{label}</span>}
              {badge && newFeedbacksCount > 0 && (
                <span className={`${collapsed ? 'absolute -top-1 -right-1' : 'ml-auto'} min-w-[20px] h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1`}>
                  {newFeedbacksCount > 99 ? '99+' : newFeedbacksCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Déconnexion */}
      <div className="border-t border-slate-700 p-3">
        <button
          onClick={handleLogout}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-slate-400 hover:bg-red-900/30 hover:text-red-400 transition ${collapsed ? 'justify-center' : ''}`}
          title={collapsed ? 'Déconnexion' : undefined}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Déconnexion</span>}
        </button>

        {/* Bouton réduire (desktop) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex items-center justify-center w-full mt-1 p-2 rounded-xl text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      {/* Sidebar Mobile Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
        </div>
      )}

      {/* Sidebar Mobile */}
      <aside className={`fixed inset-y-0 left-0 z-50 lg:hidden transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} w-64 shadow-2xl`}>
        <div className="absolute top-3 right-3 z-10">
          <button onClick={() => setMobileOpen(false)} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <SidebarContent />
      </aside>

      {/* Sidebar Desktop */}
      <aside className={`hidden lg:flex flex-col flex-shrink-0 transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'} border-r border-slate-800`}>
        <SidebarContent />
      </aside>

      {/* Contenu principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900 h-14 flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Burger Mobile */}
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden text-slate-400 hover:text-white p-1"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <p className="text-white font-bold text-sm">GESTIO 229 ADMIN</p>
              <p className="text-emerald-400 text-xs">ESPACE PROPRIÉTAIRE / SUPER ADMIN</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Notifications */}
            <Link
              to="/admin/feedbacks"
              className="relative text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition"
              title={`${newFeedbacksCount} nouveaux avis`}
            >
              <Bell className="w-4 h-4" />
              {newFeedbacksCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {newFeedbacksCount > 9 ? '9+' : newFeedbacksCount}
                </span>
              )}
            </Link>

            {/* Badge Super Admin */}
            <div className="hidden sm:flex items-center gap-2 bg-emerald-900/30 border border-emerald-700 px-3 py-1 rounded-full">
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-emerald-300 text-xs font-bold">Super Admin</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-slate-950">
          <div className="p-4 lg:p-6 max-w-none">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

export default AdminLayout
