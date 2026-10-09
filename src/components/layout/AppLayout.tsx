// =============================================================================
// GESTIO 229 SaaS — AppLayout : Shell principal avec Sidebar 14 modules
// =============================================================================

import React, { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { useUIStore } from '../../store/uiStore'
import ToastContainer from '../ui/ToastContainer'
import SectorErrorBoundary from '../common/SectorErrorBoundary'
import { AppProvider } from '../../contexts/AppContext'

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
    <div 
      className="flex h-screen w-full overflow-hidden app-container transition-colors duration-200"
      style={{ background: 'var(--bg-main)', color: 'var(--text-main)' }}
    >
      {/* Overlay mobile */}
      {sidebarMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={closeMobileSidebar}
        />
      )}

      {/* Sidebar */}
      <Sidebar />

      {/* Main content direct sans spacer blanc */}
      <div 
        className="flex-1 flex flex-col min-w-0 overflow-hidden transition-colors duration-200"
        style={{ background: 'var(--bg-main)' }}
      >
        <Header />
        <main 
          className="flex-1 overflow-y-auto pt-4 transition-colors duration-200"
          style={{ background: 'var(--bg-main)' }}
        >
          <div className="px-4 pb-6 md:px-6 md:pb-8 animate-fade-in max-w-7xl w-full mx-auto">
            <SectorErrorBoundary>
              <AppProvider>
                <Outlet />
              </AppProvider>
            </SectorErrorBoundary>
          </div>
        </main>
      </div>

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  )
}

export default AppLayout
