// =============================================================================
// GESTIO 229 SaaS — AppLayout : Shell principal avec Sidebar 14 modules
// =============================================================================

import React, { useEffect, Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { useUIStore } from '../../store/uiStore'
import { useAppCacheStore } from '../../store/appCacheStore'
import ToastContainer from '../ui/ToastContainer'
import SectorErrorBoundary from '../common/SectorErrorBoundary'
import { AppProvider } from '../../contexts/AppContext'
import { ModuleSkeleton } from '../ui/Skeleton'
import { useAuthStore } from '../../store/authStore'
import { useTenant } from '../../hooks/useTenant'
import { setActiveSector } from '../../lib/sectorClient'

const AppLayout: React.FC = () => {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const sidebarMobileOpen = useUIStore((s) => s.sidebarMobileOpen)
  const closeMobileSidebar = useUIStore((s) => s.closeMobileSidebar)
  const setActiveModule = useUIStore((s) => s.setActiveModule)
  const setLastVisitedModule = useAppCacheStore((s) => s.setLastVisitedModule)
  const location = useLocation()
  const { status, company } = useAuthStore()
  const { sectorSlug } = useTenant()

  // Mettre à jour le module actif selon la route et mémoriser l'historique
  useEffect(() => {
    const parts = location.pathname.split('/')
    const moduleId = parts[2] ?? null
    setActiveModule(moduleId)
    setLastVisitedModule(location.pathname)
    closeMobileSidebar()
  }, [location.pathname, setActiveModule, setLastVisitedModule, closeMobileSidebar])

  // Synchroniser le secteur actif dans le client global
  useEffect(() => {
    if (sectorSlug) {
      setActiveSector(sectorSlug)
    }
  }, [sectorSlug])

  // Attente résiliente avec skeleton léger si company est en cours de chargement
  if (!company && (status === 'idle' || status === 'loading')) {
    return <ModuleSkeleton />
  }

  return (
    <div 
      className="flex h-screen w-full overflow-hidden app-container transition-colors duration-200"
      style={{ background: 'var(--bg-main)', color: 'var(--text-main)' }}
    >
      {/* Overlay Drawer Mobile / Overlay fluide */}
      <div
        className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-30 lg:hidden transition-opacity duration-300 ${
          sidebarMobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeMobileSidebar}
        aria-hidden="true"
      />

      {/* Sidebar Drawer */}
      <Sidebar />

      {/* Main layout reste monté en permanence (Header + Contenu Outlet) */}
      <div 
        className="flex-1 flex flex-col min-w-0 overflow-hidden transition-colors duration-200"
        style={{ background: 'var(--bg-main)' }}
      >
        <Header />
        <main 
          className="flex-1 overflow-y-auto pt-2 lg:pt-3 transition-colors duration-200 w-full"
          style={{ background: 'var(--bg-main)' }}
        >
          <div className="w-full max-w-none px-3 lg:px-4 pb-6 md:pb-8">
            <SectorErrorBoundary>
              <AppProvider>
                <Suspense fallback={<ModuleSkeleton />}>
                  <Outlet />
                </Suspense>
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
