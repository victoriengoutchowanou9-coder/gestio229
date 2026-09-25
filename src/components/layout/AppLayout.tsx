// =============================================================================
// GESTIO 229 SaaS — AppLayout : Shell principal avec Sidebar 14 modules
// =============================================================================

import React, { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { useUIStore } from '../../store/uiStore'
import ToastContainer from '../ui/ToastContainer'

const AppLayout: React.FC = () => {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const sidebarMobileOpen = useUIStore((s) => s.sidebarMobileOpen)
  const closeMobileSidebar = useUIStore((s) => s.closeMobileSidebar)
  const setActiveModule = useUIStore((s) => s.setActiveModule)
  const location = useLocation()

  // Mettre à jour le module actif selon la route
  useEffect(() => {
    const parts = location.pathname.split('/')
    const moduleId = parts[2] ?? null
    setActiveModule(moduleId)
    closeMobileSidebar()
  }, [location.pathname])

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Overlay mobile */}
      {sidebarMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={closeMobileSidebar}
        />
      )}

      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-6 animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  )
}

export default AppLayout
