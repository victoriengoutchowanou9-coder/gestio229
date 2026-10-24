// =============================================================================
// GESTIO 229 SaaS — AppLayout : Shell principal avec Sidebar & Bandeau Abonnement Secteur
// =============================================================================

import React, { useEffect, useState, Suspense } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Lock, CreditCard, ArrowRight, AlertTriangle } from 'lucide-react'
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
import {
  evaluerAccesSecteur,
  VerificationAccesSecteurResult,
  canonicalSectorSlug,
} from '../../services/abonnementService'

const AppLayout: React.FC = () => {
  const sidebarMobileOpen = useUIStore((s) => s.sidebarMobileOpen)
  const closeMobileSidebar = useUIStore((s) => s.closeMobileSidebar)
  const setActiveModule = useUIStore((s) => s.setActiveModule)
  const setLastVisitedModule = useAppCacheStore((s) => s.setLastVisitedModule)
  const location = useLocation()
  const navigate = useNavigate()
  const { status, company } = useAuthStore()
  const { sectorSlug } = useTenant()
  const [sectorAccess, setSectorAccess] = useState<VerificationAccesSecteurResult | null>(null)

  const cleanSectorSlug = sectorSlug ? canonicalSectorSlug(sectorSlug) : ''

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

  // Vérifier l'état d'abonnement du secteur courant (Section 4)
  useEffect(() => {
    let mounted = true
    if (!company?.id || !cleanSectorSlug) {
      setSectorAccess(null)
      return
    }
    evaluerAccesSecteur(company.id, cleanSectorSlug, company.created_at, true)
      .then((res) => {
        if (mounted) setSectorAccess(res)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [company?.id, cleanSectorSlug, location.pathname])

  // Attente résiliente avec skeleton léger si company est en cours de chargement
  if (!company && (status === 'idle' || status === 'loading')) {
    return <ModuleSkeleton />
  }

  const isOnDashboard =
    location.pathname.endsWith('/tableau-bord') ||
    location.pathname.endsWith('/dashboard') ||
    location.pathname === `/app/${cleanSectorSlug}`
  const isSectorLocked = Boolean(sectorAccess && !sectorAccess.autorise)
  const abonnementHref = cleanSectorSlug ? `/app/${cleanSectorSlug}/abonnement` : '/abonnement'

  return (
    <div
      className="flex h-screen w-full overflow-hidden app-container transition-colors duration-200"
      style={{ background: 'var(--bg-main)', color: 'var(--text-main)' }}
    >
      {/* Overlay Drawer Mobile */}
      <div
        className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-30 lg:hidden transition-opacity duration-300 ${
          sidebarMobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeMobileSidebar}
        aria-hidden="true"
      />

      {/* Sidebar Drawer */}
      <Sidebar sectorAccess={sectorAccess} />

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
            {/* Bandeau officiel sur le Tableau de bord d'un secteur verrouillé (Section 4 Étape 3) */}
            {isSectorLocked && isOnDashboard && (
              <div className="mb-5 rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-slate-900/90 to-slate-900 p-4 sm:p-5 shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                      {sectorAccess?.statutEffectif === 'en_attente_paiement' ? (
                        <Lock className="w-5 h-5 text-amber-400" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {sectorAccess?.badgeLabel || 'En attente de paiement'}
                        </span>
                        <h3 className="text-sm font-bold text-white">
                          Activation d'abonnement requise pour débloquer les modules
                        </h3>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-200 mt-1 leading-relaxed">
                        Votre secteur a été ajouté avec succès. Pour accéder à l'ensemble de ses fonctionnalités, veuillez activer votre abonnement.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate(abonnementHref)}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-emerald-500/20 shrink-0 transition-all"
                  >
                    <CreditCard className="w-4 h-4" />
                    Activer mon abonnement
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

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
