// =============================================================================
// GESTIO 229 SaaS — App.tsx : Router Principal React Router v6
// =============================================================================

import React, { useEffect, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import AppLayout from './components/layout/AppLayout'
import ModuleGuard from './components/subscription/ModuleGuard'
import SectorGuard from './components/subscription/SectorGuard'
import { getCompanySubscriptionInfo } from './core/subscription/subscriptionEngine'

// ─── Lazy Loading des pages ─────────────────────────────────────────────────

// Auth
const LoginPage     = lazy(() => import('./pages/auth/LoginPage'))
const RegisterPage  = lazy(() => import('./pages/auth/RegisterPage'))

// Dashboard
const DashboardPage   = lazy(() => import('./pages/dashboard/DashboardPage'))
const POSPage         = lazy(() => import('./pages/dashboard/vente-pos/POSPage'))
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
const UtilisateursPage   = lazy(() => import('./pages/dashboard/utilisateurs/UtilisateursPage'))
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

  const isConfirmationOrSignupReturn = 
    window.location.search.includes('confirmed=') || 
    window.location.search.includes('registered=') ||
    window.location.search.includes('code=') ||
    window.location.hash.includes('access_token')

  if (status === 'authenticated' && tenantCtx && !isConfirmationOrSignupReturn) {
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

// ─── Page Suspendu / Essai Expiré ────────────────────────────────────────────

const SuspendedPage = () => {
  const company = useAuthStore((s) => s.company)
  const logout = useAuthStore((s) => s.logout)
  const subInfo = getCompanySubscriptionInfo(company)

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-700 p-8 sm:p-10 max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-5 shadow-sm text-3xl">
          🔒
        </div>
        <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-2">
          {subInfo.isSuspended ? 'Compte Suspendu' : "Période d'Essai de 30 Jours Expirée"}
        </h1>
        <p className="text-slate-600 dark:text-slate-300 text-sm mb-6 leading-relaxed">
          {subInfo.isSuspended
            ? `Le compte ${company?.name || 'de votre entreprise'} est actuellement suspendu. Veuillez régulariser votre abonnement.`
            : `Votre période d'essai gratuit de 30 jours pour ${company?.name || 'votre entreprise'} est arrivée à échéance. Veuillez activer votre abonnement pour débloquer l'accès à vos sous-logiciels et données.`}
        </p>
        <div className="flex flex-col gap-3">
          <Link
            to="/dashboard/abonnement"
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md shadow-emerald-600/20 transition"
          >
            Consulter les Formules & Renouveler
          </Link>
          <button
            onClick={logout}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 font-semibold text-sm transition"
          >
            Se déconnecter
          </button>
        </div>
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

      {/* Compte suspendu / Essai Expiré */}
      <Route path="/suspended" element={<SuspendedPage />} />

      {/* Hub multi-services */}
      <Route
        path="/hub"
        element={<ProtectedRoute><HubPage /></ProtectedRoute>}
      />

      {/* Espaces d'exploitation des Sous-Logiciels Spécialisés (Isolation Totale) */}
      <Route
        path="/app/:sectorSlug"
        element={
          <ProtectedRoute>
            <SectorGuard>
              <AppLayout />
            </SectorGuard>
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="tableau-bord" replace />} />
        <Route path="tableau-bord"   element={<ModuleGuard moduleId="dashboard"><DashboardPage /></ModuleGuard>} />
        <Route path="dashboard"      element={<ModuleGuard moduleId="dashboard"><DashboardPage /></ModuleGuard>} />
        <Route path="vente"          element={<ModuleGuard moduleId="ventes"><POSPage /></ModuleGuard>} />
        <Route path="vente-pos"      element={<ModuleGuard moduleId="ventes"><POSPage /></ModuleGuard>} />
        <Route path="stocks"         element={<ModuleGuard moduleId="stock"><StocksPage /></ModuleGuard>} />
        <Route path="caisse"         element={<ModuleGuard moduleId="caisse"><CaissePage /></ModuleGuard>} />
        <Route path="tresorerie"     element={<ModuleGuard moduleId="finances"><TresoreriePage /></ModuleGuard>} />
        <Route path="clients"        element={<ModuleGuard moduleId="clients"><ClientsPage /></ModuleGuard>} />
        <Route path="achats"         element={<ModuleGuard moduleId="fournisseurs"><FournisseursPage /></ModuleGuard>} />
        <Route path="fournisseurs"   element={<ModuleGuard moduleId="fournisseurs"><FournisseursPage /></ModuleGuard>} />
        <Route path="depenses"       element={<ModuleGuard moduleId="depenses"><DepensesPage /></ModuleGuard>} />
        <Route path="reporting"      element={<ModuleGuard moduleId="rapports"><ReportingPage /></ModuleGuard>} />
        <Route path="rapports"        element={<ModuleGuard moduleId="rapports"><ReportingPage /></ModuleGuard>} />
        <Route path="syscohada"      element={<ModuleGuard moduleId="syscohada"><SyscohadaPage /></ModuleGuard>} />
        <Route path="configuration"  element={<ModuleGuard moduleId="configuration"><ConfigPage /></ModuleGuard>} />
        <Route path="journal-audit"  element={<ModuleGuard moduleId="audit"><AuditPage /></ModuleGuard>} />
        <Route path="audit"          element={<ModuleGuard moduleId="audit"><AuditPage /></ModuleGuard>} />
        <Route path="abonnement"     element={<AbonnementPage />} />
        <Route path="utilisateurs"   element={<ModuleGuard moduleId="utilisateurs"><UtilisateursPage /></ModuleGuard>} />
      </Route>

      {/* Point 14 : Routes directes par secteur (Ex: /quincaillerie/tableau-bord, /poissonnerie/stocks...) */}
      <Route
        path="/:sectorSlug"
        element={
          <ProtectedRoute>
            <SectorGuard>
              <AppLayout />
            </SectorGuard>
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="tableau-bord" replace />} />
        <Route path="tableau-bord"   element={<ModuleGuard moduleId="dashboard"><DashboardPage /></ModuleGuard>} />
        <Route path="dashboard"      element={<ModuleGuard moduleId="dashboard"><DashboardPage /></ModuleGuard>} />
        <Route path="vente"          element={<ModuleGuard moduleId="ventes"><POSPage /></ModuleGuard>} />
        <Route path="vente-pos"      element={<ModuleGuard moduleId="ventes"><POSPage /></ModuleGuard>} />
        <Route path="stocks"         element={<ModuleGuard moduleId="stock"><StocksPage /></ModuleGuard>} />
        <Route path="caisse"         element={<ModuleGuard moduleId="caisse"><CaissePage /></ModuleGuard>} />
        <Route path="tresorerie"     element={<ModuleGuard moduleId="finances"><TresoreriePage /></ModuleGuard>} />
        <Route path="clients"        element={<ModuleGuard moduleId="clients"><ClientsPage /></ModuleGuard>} />
        <Route path="achats"         element={<ModuleGuard moduleId="fournisseurs"><FournisseursPage /></ModuleGuard>} />
        <Route path="fournisseurs"   element={<ModuleGuard moduleId="fournisseurs"><FournisseursPage /></ModuleGuard>} />
        <Route path="depenses"       element={<ModuleGuard moduleId="depenses"><DepensesPage /></ModuleGuard>} />
        <Route path="reporting"      element={<ModuleGuard moduleId="rapports"><ReportingPage /></ModuleGuard>} />
        <Route path="rapports"        element={<ModuleGuard moduleId="rapports"><ReportingPage /></ModuleGuard>} />
        <Route path="syscohada"      element={<ModuleGuard moduleId="syscohada"><SyscohadaPage /></ModuleGuard>} />
        <Route path="configuration"  element={<ModuleGuard moduleId="configuration"><ConfigPage /></ModuleGuard>} />
        <Route path="journal-audit"  element={<ModuleGuard moduleId="audit"><AuditPage /></ModuleGuard>} />
        <Route path="audit"          element={<ModuleGuard moduleId="audit"><AuditPage /></ModuleGuard>} />
        <Route path="abonnement"     element={<AbonnementPage />} />
        <Route path="utilisateurs"   element={<ModuleGuard moduleId="utilisateurs"><UtilisateursPage /></ModuleGuard>} />
      </Route>

      {/* Rétrocompatibilité /dashboard */}
      <Route
        path="/dashboard"
        element={<ProtectedRoute><AppLayout /></ProtectedRoute>}
      >
        <Route index element={<Navigate to="/dashboard/tableau-bord" replace />} />
        <Route path="tableau-bord"   element={<ModuleGuard moduleId="dashboard"><DashboardPage /></ModuleGuard>} />
        <Route path="dashboard"      element={<ModuleGuard moduleId="dashboard"><DashboardPage /></ModuleGuard>} />
        <Route path="vente"          element={<ModuleGuard moduleId="ventes"><POSPage /></ModuleGuard>} />
        <Route path="vente-pos"      element={<ModuleGuard moduleId="ventes"><POSPage /></ModuleGuard>} />
        <Route path="stocks"         element={<ModuleGuard moduleId="stock"><StocksPage /></ModuleGuard>} />
        <Route path="caisse"         element={<ModuleGuard moduleId="caisse"><CaissePage /></ModuleGuard>} />
        <Route path="tresorerie"     element={<ModuleGuard moduleId="finances"><TresoreriePage /></ModuleGuard>} />
        <Route path="clients"        element={<ModuleGuard moduleId="clients"><ClientsPage /></ModuleGuard>} />
        <Route path="achats"         element={<ModuleGuard moduleId="fournisseurs"><FournisseursPage /></ModuleGuard>} />
        <Route path="fournisseurs"   element={<ModuleGuard moduleId="fournisseurs"><FournisseursPage /></ModuleGuard>} />
        <Route path="depenses"       element={<ModuleGuard moduleId="depenses"><DepensesPage /></ModuleGuard>} />
        <Route path="reporting"      element={<ModuleGuard moduleId="rapports"><ReportingPage /></ModuleGuard>} />
        <Route path="syscohada"      element={<ModuleGuard moduleId="syscohada"><SyscohadaPage /></ModuleGuard>} />
        <Route path="configuration"  element={<ModuleGuard moduleId="configuration"><ConfigPage /></ModuleGuard>} />
        <Route path="journal-audit"  element={<ModuleGuard moduleId="audit"><AuditPage /></ModuleGuard>} />
        <Route path="abonnement"     element={<AbonnementPage />} />
        <Route path="utilisateurs"   element={<ModuleGuard moduleId="utilisateurs"><UtilisateursPage /></ModuleGuard>} />
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
