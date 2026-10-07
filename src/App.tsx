// =============================================================================
// GESTIO 229 SaaS — App.tsx : Router Principal React Router v6
// =============================================================================

import React, { useEffect, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import AppLayout from './components/layout/AppLayout'
import ModuleGuard from './components/subscription/ModuleGuard'
import SectorGuard from './components/subscription/SectorGuard'
import SectorErrorBoundary from './components/common/SectorErrorBoundary'
import { getCompanySubscriptionInfo } from './core/subscription/subscriptionEngine'
import { safeLazy } from './lib/safeLazy'
import { useTenant } from './hooks/useTenant'

// ─── Lazy Loading des pages (safeLazy = auto-reload si chunk introuvable) ────

// Auth
const LoginPage     = safeLazy(() => import('./pages/auth/LoginPage'))
const RegisterPage  = safeLazy(() => import('./pages/auth/RegisterPage'))

// Dashboard
const DashboardPage   = safeLazy(() => import('./pages/dashboard/DashboardPage'))
const POSPage         = safeLazy(() => import('./pages/dashboard/vente-pos/POSPage'))
const StocksPage         = safeLazy(() => import('./pages/dashboard/stocks/StocksPage'))
const CaissePage         = safeLazy(() => import('./pages/dashboard/caisse/CaissePage'))
const TresoreriePage     = safeLazy(() => import('./pages/dashboard/tresorerie/TresoreriePage'))
const ClientsPage        = safeLazy(() => import('./pages/dashboard/clients/ClientsPage'))
const FournisseursPage   = safeLazy(() => import('./pages/dashboard/fournisseurs/FournisseursPage'))
const DepensesPage       = safeLazy(() => import('./pages/dashboard/depenses/DepensesPage'))
const ReportingPage      = safeLazy(() => import('./pages/dashboard/reporting/ReportingPage'))
const SyscohadaPage      = safeLazy(() => import('./pages/dashboard/syscohada/SyscohadaPage'))
const ConfigPage         = safeLazy(() => import('./pages/dashboard/configuration/ConfigPage'))
const AuditPage          = safeLazy(() => import('./pages/dashboard/journal-audit/AuditPage'))
const AbonnementPage     = safeLazy(() => import('./pages/dashboard/abonnement/AbonnementPage'))
const UtilisateursPage   = safeLazy(() => import('./pages/dashboard/utilisateurs/UtilisateursPage'))
const IsolationHealthPage = safeLazy(() => import('./pages/dashboard/isolation/IsolationHealthPage'))
const FournisseursPage2  = FournisseursPage // alias

// Hub multi-services
const HubPage = safeLazy(() => import('./pages/HubPage'))

// Brasserie - Consignation & Emballages
const ConsignationPage = safeLazy(() => import('./pages/dashboard/brasserie/ConsignationPage'))

// Modules spécifiques par secteur : une page générique pilotée par configuration
const SectorModulePage = safeLazy(() => import('./pages/dashboard/sector-modules/SectorModulePage'))
const mod = (moduleId: string): React.FC => () => <SectorModulePage moduleId={moduleId} />

const GrillesPage            = mod('grilles_tarifaires')
// École
const ElevesPage             = mod('eleves')
const FraisScolairesPage     = mod('frais_scolaires')
const NotesResultatsPage     = mod('notes_resultats')
const AbsencesPage           = mod('absences')
// Supermarché
const RayonsPage             = mod('rayons_gondoles')
const PromosDLCPage          = mod('promos_dlc_courtes')
// Pharmacie
const OrdonnancesPage        = mod('ordonnances')
const LotsPeremptionPage     = mod('lots_peremption')
// Station-Service & Hydrocarbures (ERP dédié)
const PompesPage             = safeLazy(() => import('./pages/dashboard/station/PompesCuvesPage'))
const PostesPage             = safeLazy(() => import('./pages/dashboard/station/PostesPompistesPage'))
const FlottesPage            = safeLazy(() => import('./pages/dashboard/station/FlottesClientsPage'))
const AnomaliesPage          = safeLazy(() => import('./pages/dashboard/station/AnomaliesControlesPage'))
const StationDashboardPage   = safeLazy(() => import('./pages/dashboard/station/StationDashboardPage'))
const LubrifiantsPage        = mod('lubrifiants')
// Bar, Restaurant, Maquis & Fast-Food (ERP dédié)
const RestaurantDashboardPage = safeLazy(() => import('./pages/dashboard/restaurant/RestaurantDashboardPage'))
const TablesPlanPage          = safeLazy(() => import('./pages/dashboard/restaurant/TablesPlanPage'))
const CuisineBarKDSPage       = safeLazy(() => import('./pages/dashboard/restaurant/CuisineBarKDSPage'))
const RecettesFichesPage      = safeLazy(() => import('./pages/dashboard/restaurant/RecettesFichesPage'))
const ReservationsPage        = safeLazy(() => import('./pages/dashboard/restaurant/ReservationsPage'))
const PertesGaspillagePage    = safeLazy(() => import('./pages/dashboard/restaurant/PertesGaspillagePage'))
const ServeursPersonnelPage   = safeLazy(() => import('./pages/dashboard/restaurant/ServeursPersonnelPage'))
const EvenementsPage          = safeLazy(() => import('./pages/dashboard/restaurant/EvenementsPage'))
// Hôtel
const ChambresHotelPage      = mod('chambres_reservations')
const HousekeepingPage       = mod('housekeeping')
// Garage
const VehiculesPage          = mod('vehicules_reparations')
const ReparationsPage        = mod('ordres_reparation')
// Microfinance / Tontine (ERP Dédié & Conforme UEMOA)
const MicrofinanceDashboardPage = safeLazy(() => import('./pages/dashboard/microfinance/MicrofinanceDashboardPage'))
const MembresEpargnePage        = safeLazy(() => import('./pages/dashboard/microfinance/MembresEpargnePage'))
const CreditsEcheanciersPage    = safeLazy(() => import('./pages/dashboard/microfinance/CreditsEcheanciersPage'))
const TontinesCyclesPage        = safeLazy(() => import('./pages/dashboard/microfinance/TontinesCyclesPage'))
const AgentsCollecteursPage     = safeLazy(() => import('./pages/dashboard/microfinance/AgentsCollecteursPage'))
const RisquesConformitePage     = safeLazy(() => import('./pages/dashboard/microfinance/RisquesConformitePage'))
const MicrofinanceAchatsPage    = safeLazy(() => import('./pages/dashboard/microfinance/MicrofinanceAchatsPage'))
const MicrofinanceTresoreriePage = safeLazy(() => import('./pages/dashboard/microfinance/MicrofinanceTresoreriePage'))
// Imprimerie & Sérigraphie Dédiée
const ImprimerieDashboardPage       = safeLazy(() => import('./pages/dashboard/imprimerie/ImprimerieDashboardPage'))
const ImprimerieDevisProductionPage = safeLazy(() => import('./pages/dashboard/imprimerie/ImprimerieDevisProductionPage'))
const ImprimeriePrestationsPage     = safeLazy(() => import('./pages/dashboard/imprimerie/ImprimeriePrestationsPage'))
const ImprimerieMatieresPage        = safeLazy(() => import('./pages/dashboard/imprimerie/ImprimerieMatieresPage'))
const ImprimerieSousTraitancePage   = safeLazy(() => import('./pages/dashboard/imprimerie/ImprimerieSousTraitancePage'))
const ImprimerieReportingPage       = safeLazy(() => import('./pages/dashboard/imprimerie/ImprimerieReportingPage'))
const ImprimerieVenteRapidePage     = safeLazy(() => import('./pages/dashboard/imprimerie/ImprimerieVenteRapidePage'))
// Gestion Locative / Immobilier
const BiensPage              = mod('biens_locations')
const ContratsPage           = mod('contrats_loyers')
const QuittancesPage         = mod('quittances')
// Poissonnerie
const ChambresFroidesPage    = mod('chambres_froides')
const PeseePage              = mod('pesee_cartons')
const AvariesPage            = mod('avaries_peremption')
// Quincaillerie
const MateriauxPage          = mod('materiaux_btp')
const ConversionsPage        = mod('conversions_unites')
const ChantiersPage          = mod('suivi_chantiers')
// Événementiel
const PlanningEvenementsPage = mod('reservations_dates')
const MaterielPage           = mod('location_materiel')
const TraiteurPage           = mod('traiteur_prestations')




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
 * AdminHubGuard : Bloque l'accès au HUB aux utilisateurs internes non-admin
 * Redirige directement vers leur espace d'activité assigné
 */
const AdminHubGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, status } = useAuthStore()
  if (status === 'idle' || status === 'loading') return <FullPageLoader />
  const isAdmin = !user || user.role === 'administrateur' || user.role === 'super_admin'
  if (!isAdmin) {
    const perm = (typeof user?.permissions === 'object' && user.permissions) ? user.permissions : {}
    const assignedSector = (perm.sector_slug || perm.sector_id || user?.sector_id || localStorage.getItem('gestio229_active_sector') || 'boutique').toLowerCase().replace(/^sec-/, '')
    const role = user?.role?.toLowerCase() || ''
    let targetModule = 'tableau-bord'
    if (role === 'caissier' || role === 'vendeur') targetModule = 'vente-pos'
    else if (role === 'magasinier') targetModule = 'stocks'
    else if (role === 'comptable') targetModule = 'syscohada'
    return <Navigate to={`/app/${assignedSector}/${targetModule}`} replace />
  }
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

// ─── Dashboard conditionnel spécialisé Station-Service, Restaurant & Microfinance ───
const SectorAwareDashboard: React.FC = () => {
  const { sectorSlug } = useTenant()
  const clean = sectorSlug ? sectorSlug.toLowerCase().trim().replace(/^sec-/, '') : ''
  if (clean === 'station-service' || clean === 'station' || clean === 'hydrocarbures') {
    return <StationDashboardPage />
  }
  if (clean === 'restaurant' || clean === 'bar-restaurant-maquis' || clean === 'bar' || clean === 'maquis' || clean === 'fastfood') {
    return <RestaurantDashboardPage />
  }
  if (clean === 'microfinance' || clean === 'microfinance-tontine' || clean === 'tontine') {
    return <MicrofinanceDashboardPage />
  }
  if (clean === 'imprimerie' || clean === 'impression') {
    return <ImprimerieDashboardPage />
  }
  return <DashboardPage />
}

// ─── Vente & POS conditionnel (Spécialisé Vente Rapide pour Imprimerie) ───────────
const SectorAwareVentes: React.FC = () => {
  const { sectorSlug } = useTenant()
  const clean = sectorSlug ? sectorSlug.toLowerCase().trim().replace(/^sec-/, '') : ''
  if (clean === 'imprimerie' || clean === 'impression') {
    return <ImprimerieVenteRapidePage />
  }
  return <POSPage />
}

// ─── Stocks conditionnel (Spécialisé Matières Premières & Bobines Imprimerie) ────
const SectorAwareStocks: React.FC = () => {
  const { sectorSlug } = useTenant()
  const clean = sectorSlug ? sectorSlug.toLowerCase().trim().replace(/^sec-/, '') : ''
  if (clean === 'imprimerie' || clean === 'impression') {
    return <ImprimerieMatieresPage />
  }
  return <StocksPage />
}

// ─── Reporting conditionnel (Spécialisé Rentabilité par Prestation Imprimerie) ────
const SectorAwareReporting: React.FC = () => {
  const { sectorSlug } = useTenant()
  const clean = sectorSlug ? sectorSlug.toLowerCase().trim().replace(/^sec-/, '') : ''
  if (clean === 'imprimerie' || clean === 'impression') {
    return <ImprimerieReportingPage />
  }
  return <ReportingPage />
}

// ─── Fournisseurs & Achats conditionnel (Spécialisé Charges Exploitation IMF) ─────
const SectorAwareFournisseurs: React.FC = () => {
  const { sectorSlug } = useTenant()
  const clean = sectorSlug ? sectorSlug.toLowerCase().trim().replace(/^sec-/, '') : ''
  if (clean === 'microfinance' || clean === 'microfinance-tontine' || clean === 'tontine') {
    return <MicrofinanceAchatsPage />
  }
  return <FournisseursPage />
}

// ─── Trésorerie conditionnelle (Multi-Canaux SFD pour Microfinance) ───────────
const SectorAwareTresorerie: React.FC = () => {
  const { sectorSlug } = useTenant()
  const clean = sectorSlug ? sectorSlug.toLowerCase().trim().replace(/^sec-/, '') : ''
  if (clean === 'microfinance' || clean === 'microfinance-tontine' || clean === 'tontine') {
    return <MicrofinanceTresoreriePage />
  }
  return <TresoreriePage />
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

      {/* Hub multi-services (Réservé exclusivement aux administrateurs) */}
      <Route
        path="/hub"
        element={
          <ProtectedRoute>
            <AdminHubGuard>
              <HubPage />
            </AdminHubGuard>
          </ProtectedRoute>
        }
      />

      {/* Route dédiée Abonnement & Licence (accessible partout avec layout complet) */}
      <Route
        path="/abonnement"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AbonnementPage />} />
      </Route>
      <Route path="/subscription" element={<Navigate to="/abonnement" replace />} />

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
        <Route path="tableau-bord"   element={<ModuleGuard moduleId="dashboard"><SectorAwareDashboard /></ModuleGuard>} />
        <Route path="dashboard"      element={<ModuleGuard moduleId="dashboard"><SectorAwareDashboard /></ModuleGuard>} />
        <Route path="vente"          element={<ModuleGuard moduleId="ventes"><SectorAwareVentes /></ModuleGuard>} />
        <Route path="vente-pos"      element={<ModuleGuard moduleId="ventes"><SectorAwareVentes /></ModuleGuard>} />
        <Route path="stocks"         element={<ModuleGuard moduleId="stock"><SectorAwareStocks /></ModuleGuard>} />
        <Route path="caisse"         element={<ModuleGuard moduleId="caisse"><CaissePage /></ModuleGuard>} />
        <Route path="tresorerie"     element={<ModuleGuard moduleId="finances"><SectorAwareTresorerie /></ModuleGuard>} />
        <Route path="clients"        element={<ModuleGuard moduleId="clients"><ClientsPage /></ModuleGuard>} />
        <Route path="achats"         element={<ModuleGuard moduleId="fournisseurs"><SectorAwareFournisseurs /></ModuleGuard>} />
        <Route path="fournisseurs"   element={<ModuleGuard moduleId="fournisseurs"><SectorAwareFournisseurs /></ModuleGuard>} />
        <Route path="depenses"       element={<ModuleGuard moduleId="depenses"><DepensesPage /></ModuleGuard>} />
        <Route path="reporting"      element={<ModuleGuard moduleId="rapports"><SectorAwareReporting /></ModuleGuard>} />
        <Route path="rapports"        element={<ModuleGuard moduleId="rapports"><SectorAwareReporting /></ModuleGuard>} />
        <Route path="syscohada"      element={<ModuleGuard moduleId="syscohada"><SyscohadaPage /></ModuleGuard>} />
        <Route path="configuration"  element={<ModuleGuard moduleId="configuration"><ConfigPage /></ModuleGuard>} />
        <Route path="journal-audit"  element={<ModuleGuard moduleId="audit"><AuditPage /></ModuleGuard>} />
        <Route path="audit"          element={<ModuleGuard moduleId="audit"><AuditPage /></ModuleGuard>} />
        <Route path="abonnement"     element={<AbonnementPage />} />
        <Route path="utilisateurs"   element={<ModuleGuard moduleId="utilisateurs"><UtilisateursPage /></ModuleGuard>} />
        <Route path="isolation"       element={<IsolationHealthPage />} />
        <Route path="sante-isolation" element={<IsolationHealthPage />} />
        <Route path="consignation"    element={<ModuleGuard moduleId="consignation"><ConsignationPage /></ModuleGuard>} />
        <Route path="grilles"         element={<ModuleGuard moduleId="grilles_tarifaires"><GrillesPage /></ModuleGuard>} />
        {/* ── Modules École ── */}
        <Route path="eleves"   element={<ModuleGuard moduleId="eleves"><ElevesPage /></ModuleGuard>} />
        <Route path="frais"    element={<ModuleGuard moduleId="frais_scolaires"><FraisScolairesPage /></ModuleGuard>} />
        <Route path="notes"    element={<ModuleGuard moduleId="notes_resultats"><NotesResultatsPage /></ModuleGuard>} />
        <Route path="absences" element={<ModuleGuard moduleId="absences"><AbsencesPage /></ModuleGuard>} />
        {/* ── Modules Supermarché ── */}
        <Route path="rayons"     element={<ModuleGuard moduleId="rayons_gondoles"><RayonsPage /></ModuleGuard>} />
        <Route path="promos-dlc" element={<ModuleGuard moduleId="promos_dlc_courtes"><PromosDLCPage /></ModuleGuard>} />
        {/* ── Modules Pharmacie ── */}
        <Route path="ordonnances" element={<ModuleGuard moduleId="ordonnances"><OrdonnancesPage /></ModuleGuard>} />
        <Route path="lots"        element={<ModuleGuard moduleId="lots_peremption"><LotsPeremptionPage /></ModuleGuard>} />
        {/* ── Modules Station-Service & Hydrocarbures ── */}
        <Route path="pompes"      element={<PompesPage />} />
        <Route path="cuves"       element={<PompesPage />} />
        <Route path="jaugeages"   element={<PompesPage />} />
        <Route path="receptions"  element={<PompesPage />} />
        <Route path="postes"      element={<PostesPage />} />
        <Route path="flottes"     element={<FlottesPage />} />
        <Route path="anomalies"   element={<AnomaliesPage />} />
        <Route path="lubrifiants" element={<ModuleGuard moduleId="lubrifiants"><LubrifiantsPage /></ModuleGuard>} />
        {/* ── Modules Bar, Restaurant, Maquis & Fast-Food ── */}
        <Route path="tables"       element={<TablesPlanPage />} />
        <Route path="cuisine-bar"  element={<CuisineBarKDSPage />} />
        <Route path="recettes"     element={<RecettesFichesPage />} />
        <Route path="reservations" element={<ReservationsPage />} />
        <Route path="pertes"       element={<PertesGaspillagePage />} />
        <Route path="serveurs"     element={<ServeursPersonnelPage />} />
        <Route path="evenements"   element={<EvenementsPage />} />
        {/* ── Modules Hôtel ── */}
        <Route path="chambres"     element={<ModuleGuard moduleId="chambres_reservations"><ChambresHotelPage /></ModuleGuard>} />
        <Route path="housekeeping" element={<ModuleGuard moduleId="housekeeping"><HousekeepingPage /></ModuleGuard>} />
        {/* ── Modules Garage ── */}
        <Route path="vehicules"   element={<ModuleGuard moduleId="vehicules_reparations"><VehiculesPage /></ModuleGuard>} />
        <Route path="reparations" element={<ModuleGuard moduleId="ordres_reparation"><ReparationsPage /></ModuleGuard>} />
        {/* ── Modules Microfinance / Tontine (ERP Dédié & Conforme UEMOA) ── */}
        <Route path="membres" element={<ModuleGuard moduleId="membres_epargne"><MembresEpargnePage /></ModuleGuard>} />
        <Route path="epargne" element={<ModuleGuard moduleId="membres_epargne"><MembresEpargnePage /></ModuleGuard>} />
        <Route path="credits" element={<ModuleGuard moduleId="credits"><CreditsEcheanciersPage /></ModuleGuard>} />
        <Route path="agents"  element={<ModuleGuard moduleId="agents_collecteurs"><AgentsCollecteursPage /></ModuleGuard>} />
        <Route path="cycles"  element={<ModuleGuard moduleId="tontine_cycles"><TontinesCyclesPage /></ModuleGuard>} />
        <Route path="tontine" element={<ModuleGuard moduleId="tontine_cycles"><TontinesCyclesPage /></ModuleGuard>} />
        <Route path="conformite" element={<RisquesConformitePage />} />
        {/* ── Modules Impression & Sérigraphie ── */}
        <Route path="devis"          element={<ModuleGuard moduleId="devis"><ImprimerieDevisProductionPage /></ModuleGuard>} />
        <Route path="prestations"    element={<ModuleGuard moduleId="prestations"><ImprimeriePrestationsPage /></ModuleGuard>} />
        <Route path="matieres"       element={<ModuleGuard moduleId="matieres"><ImprimerieMatieresPage /></ModuleGuard>} />
        <Route path="sous-traitance" element={<ModuleGuard moduleId="sous_traitance"><ImprimerieSousTraitancePage /></ModuleGuard>} />
        <Route path="vente-rapide"   element={<ModuleGuard moduleId="ventes"><ImprimerieVenteRapidePage /></ModuleGuard>} />
        {/* ── Modules Gestion Locative ── */}
        <Route path="biens"      element={<ModuleGuard moduleId="biens_locations"><BiensPage /></ModuleGuard>} />
        <Route path="contrats"   element={<ModuleGuard moduleId="contrats_loyers"><ContratsPage /></ModuleGuard>} />
        <Route path="quittances" element={<ModuleGuard moduleId="quittances"><QuittancesPage /></ModuleGuard>} />
        {/* ── Modules Poissonnerie ── */}
        <Route path="chambres-froides" element={<ModuleGuard moduleId="chambres_froides"><ChambresFroidesPage /></ModuleGuard>} />
        <Route path="pesee"            element={<ModuleGuard moduleId="pesee_cartons"><PeseePage /></ModuleGuard>} />
        <Route path="avaries"          element={<ModuleGuard moduleId="avaries_peremption"><AvariesPage /></ModuleGuard>} />
        {/* ── Modules Quincaillerie ── */}
        <Route path="materiaux"   element={<ModuleGuard moduleId="materiaux_btp"><MateriauxPage /></ModuleGuard>} />
        <Route path="conversions" element={<ModuleGuard moduleId="conversions_unites"><ConversionsPage /></ModuleGuard>} />
        <Route path="chantiers"   element={<ModuleGuard moduleId="suivi_chantiers"><ChantiersPage /></ModuleGuard>} />
        {/* ── Modules Événementiel ── */}
        <Route path="planning-evenements" element={<ModuleGuard moduleId="reservations_dates"><PlanningEvenementsPage /></ModuleGuard>} />
        <Route path="materiel"            element={<ModuleGuard moduleId="location_materiel"><MaterielPage /></ModuleGuard>} />
        <Route path="traiteur"            element={<ModuleGuard moduleId="traiteur_prestations"><TraiteurPage /></ModuleGuard>} />
      </Route>

      {/* Route directe normalisée Caisse Universelle /app/:companyId/secteur/:sectorKey/caisse */}
      <Route
        path="/app/:companyId/secteur/:sectorKey"
        element={
          <ProtectedRoute>
            <SectorGuard>
              <AppLayout />
            </SectorGuard>
          </ProtectedRoute>
        }
      >
        <Route path="caisse" element={<CaissePage />} />
      </Route>

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
        <Route path="tableau-bord"   element={<ModuleGuard moduleId="dashboard"><SectorAwareDashboard /></ModuleGuard>} />
        <Route path="dashboard"      element={<ModuleGuard moduleId="dashboard"><SectorAwareDashboard /></ModuleGuard>} />
        <Route path="vente"          element={<ModuleGuard moduleId="ventes"><SectorAwareVentes /></ModuleGuard>} />
        <Route path="vente-pos"      element={<ModuleGuard moduleId="ventes"><SectorAwareVentes /></ModuleGuard>} />
        <Route path="stocks"         element={<ModuleGuard moduleId="stock"><SectorAwareStocks /></ModuleGuard>} />
        <Route path="caisse"         element={<ModuleGuard moduleId="caisse"><CaissePage /></ModuleGuard>} />
        <Route path="tresorerie"     element={<ModuleGuard moduleId="finances"><SectorAwareTresorerie /></ModuleGuard>} />
        <Route path="clients"        element={<ModuleGuard moduleId="clients"><ClientsPage /></ModuleGuard>} />
        <Route path="achats"         element={<ModuleGuard moduleId="fournisseurs"><SectorAwareFournisseurs /></ModuleGuard>} />
        <Route path="fournisseurs"   element={<ModuleGuard moduleId="fournisseurs"><SectorAwareFournisseurs /></ModuleGuard>} />
        <Route path="depenses"       element={<ModuleGuard moduleId="depenses"><DepensesPage /></ModuleGuard>} />
        <Route path="reporting"      element={<ModuleGuard moduleId="rapports"><SectorAwareReporting /></ModuleGuard>} />
        <Route path="rapports"        element={<ModuleGuard moduleId="rapports"><SectorAwareReporting /></ModuleGuard>} />
        <Route path="syscohada"      element={<ModuleGuard moduleId="syscohada"><SyscohadaPage /></ModuleGuard>} />
        <Route path="configuration"  element={<ModuleGuard moduleId="configuration"><ConfigPage /></ModuleGuard>} />
        <Route path="journal-audit"  element={<ModuleGuard moduleId="audit"><AuditPage /></ModuleGuard>} />
        <Route path="audit"          element={<ModuleGuard moduleId="audit"><AuditPage /></ModuleGuard>} />
        <Route path="abonnement"     element={<AbonnementPage />} />
        <Route path="utilisateurs"   element={<ModuleGuard moduleId="utilisateurs"><UtilisateursPage /></ModuleGuard>} />
        <Route path="isolation"       element={<IsolationHealthPage />} />
        <Route path="sante-isolation" element={<IsolationHealthPage />} />
        <Route path="consignation"    element={<ModuleGuard moduleId="consignation"><ConsignationPage /></ModuleGuard>} />
        <Route path="grilles"         element={<ModuleGuard moduleId="grilles_tarifaires"><GrillesPage /></ModuleGuard>} />
        {/* ── Modules École ── */}
        <Route path="eleves"   element={<ModuleGuard moduleId="eleves"><ElevesPage /></ModuleGuard>} />
        <Route path="frais"    element={<ModuleGuard moduleId="frais_scolaires"><FraisScolairesPage /></ModuleGuard>} />
        <Route path="notes"    element={<ModuleGuard moduleId="notes_resultats"><NotesResultatsPage /></ModuleGuard>} />
        <Route path="absences" element={<ModuleGuard moduleId="absences"><AbsencesPage /></ModuleGuard>} />
        {/* ── Modules Supermarché ── */}
        <Route path="rayons"     element={<ModuleGuard moduleId="rayons_gondoles"><RayonsPage /></ModuleGuard>} />
        <Route path="promos-dlc" element={<ModuleGuard moduleId="promos_dlc_courtes"><PromosDLCPage /></ModuleGuard>} />
        {/* ── Modules Pharmacie ── */}
        <Route path="ordonnances" element={<ModuleGuard moduleId="ordonnances"><OrdonnancesPage /></ModuleGuard>} />
        <Route path="lots"        element={<ModuleGuard moduleId="lots_peremption"><LotsPeremptionPage /></ModuleGuard>} />
        {/* ── Modules Station-Service & Hydrocarbures ── */}
        <Route path="pompes"      element={<PompesPage />} />
        <Route path="cuves"       element={<PompesPage />} />
        <Route path="jaugeages"   element={<PompesPage />} />
        <Route path="receptions"  element={<PompesPage />} />
        <Route path="postes"      element={<PostesPage />} />
        <Route path="flottes"     element={<FlottesPage />} />
        <Route path="anomalies"   element={<AnomaliesPage />} />
        <Route path="lubrifiants" element={<ModuleGuard moduleId="lubrifiants"><LubrifiantsPage /></ModuleGuard>} />
        {/* ── Modules Bar, Restaurant, Maquis & Fast-Food ── */}
        <Route path="tables"       element={<TablesPlanPage />} />
        <Route path="cuisine-bar"  element={<CuisineBarKDSPage />} />
        <Route path="recettes"     element={<RecettesFichesPage />} />
        <Route path="reservations" element={<ReservationsPage />} />
        <Route path="pertes"       element={<PertesGaspillagePage />} />
        <Route path="serveurs"     element={<ServeursPersonnelPage />} />
        <Route path="evenements"   element={<EvenementsPage />} />
        {/* ── Modules Hôtel ── */}
        <Route path="chambres"     element={<ModuleGuard moduleId="chambres_reservations"><ChambresHotelPage /></ModuleGuard>} />
        <Route path="housekeeping" element={<ModuleGuard moduleId="housekeeping"><HousekeepingPage /></ModuleGuard>} />
        {/* ── Modules Garage ── */}
        <Route path="vehicules"   element={<ModuleGuard moduleId="vehicules_reparations"><VehiculesPage /></ModuleGuard>} />
        <Route path="reparations" element={<ModuleGuard moduleId="ordres_reparation"><ReparationsPage /></ModuleGuard>} />
        {/* ── Modules Microfinance / Tontine (ERP Dédié & Conforme UEMOA) ── */}
        <Route path="membres" element={<ModuleGuard moduleId="membres_epargne"><MembresEpargnePage /></ModuleGuard>} />
        <Route path="epargne" element={<ModuleGuard moduleId="membres_epargne"><MembresEpargnePage /></ModuleGuard>} />
        <Route path="credits" element={<ModuleGuard moduleId="credits"><CreditsEcheanciersPage /></ModuleGuard>} />
        <Route path="agents"  element={<ModuleGuard moduleId="agents_collecteurs"><AgentsCollecteursPage /></ModuleGuard>} />
        <Route path="cycles"  element={<ModuleGuard moduleId="tontine_cycles"><TontinesCyclesPage /></ModuleGuard>} />
        <Route path="tontine" element={<ModuleGuard moduleId="tontine_cycles"><TontinesCyclesPage /></ModuleGuard>} />
        <Route path="conformite" element={<RisquesConformitePage />} />
        {/* ── Modules Impression & Sérigraphie ── */}
        <Route path="devis"          element={<ModuleGuard moduleId="devis"><ImprimerieDevisProductionPage /></ModuleGuard>} />
        <Route path="prestations"    element={<ModuleGuard moduleId="prestations"><ImprimeriePrestationsPage /></ModuleGuard>} />
        <Route path="matieres"       element={<ModuleGuard moduleId="matieres"><ImprimerieMatieresPage /></ModuleGuard>} />
        <Route path="sous-traitance" element={<ModuleGuard moduleId="sous_traitance"><ImprimerieSousTraitancePage /></ModuleGuard>} />
        <Route path="vente-rapide"   element={<ModuleGuard moduleId="ventes"><ImprimerieVenteRapidePage /></ModuleGuard>} />
        {/* ── Modules Gestion Locative ── */}
        <Route path="biens"      element={<ModuleGuard moduleId="biens_locations"><BiensPage /></ModuleGuard>} />
        <Route path="contrats"   element={<ModuleGuard moduleId="contrats_loyers"><ContratsPage /></ModuleGuard>} />
        <Route path="quittances" element={<ModuleGuard moduleId="quittances"><QuittancesPage /></ModuleGuard>} />
        {/* ── Modules Poissonnerie ── */}
        <Route path="chambres-froides" element={<ModuleGuard moduleId="chambres_froides"><ChambresFroidesPage /></ModuleGuard>} />
        <Route path="pesee"            element={<ModuleGuard moduleId="pesee_cartons"><PeseePage /></ModuleGuard>} />
        <Route path="avaries"          element={<ModuleGuard moduleId="avaries_peremption"><AvariesPage /></ModuleGuard>} />
        {/* ── Modules Quincaillerie ── */}
        <Route path="materiaux"   element={<ModuleGuard moduleId="materiaux_btp"><MateriauxPage /></ModuleGuard>} />
        <Route path="conversions" element={<ModuleGuard moduleId="conversions_unites"><ConversionsPage /></ModuleGuard>} />
        <Route path="chantiers"   element={<ModuleGuard moduleId="suivi_chantiers"><ChantiersPage /></ModuleGuard>} />
        {/* ── Modules Événementiel ── */}
        <Route path="planning-evenements" element={<ModuleGuard moduleId="reservations_dates"><PlanningEvenementsPage /></ModuleGuard>} />
        <Route path="materiel"            element={<ModuleGuard moduleId="location_materiel"><MaterielPage /></ModuleGuard>} />
        <Route path="traiteur"            element={<ModuleGuard moduleId="traiteur_prestations"><TraiteurPage /></ModuleGuard>} />
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
      <SectorErrorBoundary>
        <Suspense fallback={<FullPageLoader />}>
          <AppRoutes />
        </Suspense>
      </SectorErrorBoundary>
    </BrowserRouter>
  )
}

export default App
