// =============================================================================
// GESTIO 229 SaaS — App.tsx : Router Principal React Router v6
// =============================================================================

import React, { useEffect, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import AppLayout from './components/layout/AppLayout'

// ─── Lazy Loading des pages ─────────────────────────────────────────────────

// Auth
const LoginPage     = lazy(() => import('./pages/auth/LoginPage'))
const RegisterPage  = lazy(() => import('./pages/auth/RegisterPage'))

// Dashboard
const POSPage            = lazy(() => import('./pages/dashboard/vente-pos/POSPage'))
const StocksPage         = lazy(() => import('./pages/dashboard/stocks/StocksPage'))
const CaissePage         = lazy(() => import('./pages/dashboard/caisse/CaissePage'))
const TresoreriePage     = lazy(() => import('./pages/dashboard/tresorerie/TresoreriePage'))
const ClientsPage        = lazy(() => import('./pages/dashboard/clients/ClientsPage'))
const FournisseursPage   = lazy(() => import('./pages/dashboard/fournisseurs/FournisseursPage'))
const DepensesPage       = lazy(() => import('./pages/dashboard/depenses/DepensesPage'))
const ReportingPage      = lazy(() => import('./pages/dashboard/reporting/ReportingPage'))
const SyscohadaPage      = lazy(() => import('./pages/dashboard/syscohada/SyscohadaPage'))
const ConfigPage         = lazy(() => import('./pages/dashboard/configuration/ConfigPage'))
const AuditPage          = lazy(() => import('./pages/dashboard/journal-audit/AuditPage'))
const AbonnementPage     = lazy(() => import('./pages/dashboard/abonnement/AbonnementPage'))
const FournisseursPage2  = FournisseursPage // alias

// Hub multi-services
const HubPage = lazy(() => import('./pages/HubPage'))

// ─── Loader / Spinner ───────────────────────────────────────────────────────

const FullPageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-slate-100">
    <div className="text-center">
      <div className="w-16 h-16 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-slate-600 font-medium">Chargement GESTIO 229...</p>
    </div>
  </div>
)

// ─── Guards ─────────────────────────────────────────────────────────────────

/**
 * ProtectedRoute : redirige vers /login si non authentifié
 */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const status = useAuthStore((s) => s.status)
  if (status === 'idle' || status === 'loading') return <FullPageLoader />
  if (status === 'unauthenticated') return <Navigate to="/login" replace />
  return <>{children}</>
}

/**
 * PublicRoute : redirige vers /dashboard si déjà connecté
 */
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const status = useAuthStore((s) => s.status)
  const tenantCtx = useAuthStore((s) => s.tenantCtx)
  if (status === 'authenticated' && tenantCtx) {
    return <Navigate to={tenantCtx.routingDecision.redirectTo} replace />
  }
  return <>{children}</>
}

// ─── Initialisation globale ─────────────────────────────────────────────────

const AppInitializer: React.FC = () => {
  const initialize = useAuthStore((s) => s.initialize)

  useEffect(() => {
    initialize()
  }, [initialize])

  return null
}

// ─── Page Suspendu ──────────────────────────────────────────────────────────

const SuspendedPage = () => {
  const company = useAuthStore((s) => s.company)
  const logout = useAuthStore((s) => s.logout)
  return (
    <div className="min-h-screen flex items-center justify-center bg-red-50">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md text-center">
        <div className="text-6xl mb-4">🔒</div>
        <h1 className="text-2xl font-bold text-red-700 mb-2">Compte Suspendu</h1>
        <p className="text-slate-600 mb-6">
          Le compte <strong>{company?.name}</strong> est suspendu. Veuillez renouveler votre abonnement.
        </p>
        <button
          onClick={logout}
          className="bg-red-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-red-700 transition"
        >
          Se déconnecter
        </button>
      </div>
    </div>
  )
}

// ─── Router Principal ───────────────────────────────────────────────────────

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Routes publiques */}
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/connexion" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/inscription" element={<PublicRoute><RegisterPage /></PublicRoute>} />

      {/* Compte suspendu */}
      <Route path="/suspended" element={<SuspendedPage />} />

      {/* Hub multi-services */}
      <Route
        path="/hub"
        element={<ProtectedRoute><HubPage /></ProtectedRoute>}
      />

      {/* Dashboard avec layout sidebar */}
      <Route
        path="/dashboard"
        element={<ProtectedRoute><AppLayout /></ProtectedRoute>}
      >
        <Route index element={<Navigate to="/dashboard/vente-pos" replace />} />
        <Route path="vente"          element={<POSPage />} />
        <Route path="vente-pos"      element={<POSPage />} />
        <Route path="stocks"         element={<StocksPage />} />
        <Route path="caisse"         element={<CaissePage />} />
        <Route path="tresorerie"     element={<TresoreriePage />} />
        <Route path="clients"        element={<ClientsPage />} />
        <Route path="achats"         element={<FournisseursPage />} />
        <Route path="fournisseurs"   element={<FournisseursPage />} />
        <Route path="depenses"       element={<DepensesPage />} />
        <Route path="reporting"      element={<ReportingPage />} />
        <Route path="syscohada"      element={<SyscohadaPage />} />
        <Route path="configuration"  element={<ConfigPage />} />
        <Route path="journal-audit"  element={<AuditPage />} />
        <Route path="abonnement"     element={<AbonnementPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

// ─── App Root ───────────────────────────────────────────────────────────────

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppInitializer />
      <Suspense fallback={<FullPageLoader />}>
        <AppRoutes />
      </Suspense>
    </BrowserRouter>
  )
}

export default App
