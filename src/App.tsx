// =============================================================================
// GESTIO 229 SaaS — App.tsx : Router Principal React Router v6
// =============================================================================

import React, { useEffect, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, Link, useLocation } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { supabase } from './lib/supabase'
import AppLayout from './components/layout/AppLayout'
import ModuleGuard from './components/subscription/ModuleGuard'
import SectorGuard from './components/subscription/SectorGuard'
import SectorErrorBoundary from './components/common/SectorErrorBoundary'
import { getCompanySubscriptionInfo } from './core/subscription/subscriptionEngine'
import { safeLazy } from './lib/safeLazy'
import { useTenant } from './hooks/useTenant'
import { getActiveSectorSlug } from './lib/sectorClient'
import { ThemeProvider } from './context/ThemeContext'
import { useAppCacheStore } from './store/appCacheStore'
import { preloadCommonModules } from './lib/modulePreloader'
import HubSkeleton from './components/ui/HubSkeleton'
import { ModuleSkeleton } from './components/ui/Skeleton'
import SplashScreen from './components/common/SplashScreen'
import { CustomModalGestio } from './components/modals/CustomModalGestio'
import PwaUpdateToast from './components/common/PwaUpdateToast'
import PwaInstallBanner from './components/common/PwaInstallBanner'

// ─── GESTIO 229 ADMIN — Back-Office Super Administrateur ──────────────────
import AdminLoginPage from './pages/admin/AdminLoginPage'
import AdminLayout, { AdminRoute } from './components/admin/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminCompanies from './pages/admin/AdminCompanies'
import AdminCompanyDetail from './pages/admin/AdminCompanyDetail'
import AdminSubscriptions from './pages/admin/AdminSubscriptions'
import AdminFinances from './pages/admin/AdminFinances'
import AdminSectors from './pages/admin/AdminSectors'
import AdminFeedbacks from './pages/admin/AdminFeedbacks'
import AdminAuditLog from './pages/admin/AdminAuditLog'
import AdminSettings from './pages/admin/AdminSettings'

// ─── Lazy Loading des pages (safeLazy = auto-reload si chunk introuvable) ────

// Auth
const LoginPage     = safeLazy(() => import('./pages/auth/LoginPage'))
const RegisterPage  = safeLazy(() => import('./pages/auth/RegisterPage'))
const ConfirmEmailPage = safeLazy(() => import('./pages/auth/ConfirmEmailPage'))

// Dashboard
const DashboardPage   = safeLazy(() => import('./pages/dashboard/DashboardPage'))
const POSPage         = safeLazy(() => import('./pages/dashboard/vente-pos/POSPage'))
const VendeurPage     = safeLazy(() => import('./pages/dashboard/vendeur/VendeurPage'))
const StocksPage         = safeLazy(() => import('./pages/dashboard/stocks/StocksPage'))
const CaissePage         = safeLazy(() => import('./pages/dashboard/caisse/CaissePage'))
const ClotureCaisse      = safeLazy(() => import('./pages/dashboard/caisse/ClotureCaisse'))
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

// Brasserie - Consignation & Emballages & Grilles
const ConsignationPage = safeLazy(() => import('./pages/dashboard/brasserie/ConsignationPage'))
const BrasserieGrillesPage = safeLazy(() => import('./pages/dashboard/brasserie/GrillesPage'))

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
const SupermarcheInventairePage = mod('inventaire_supermarche')
const SupermarcheReapproPage    = mod('reappro_intelligent')
const SupermarcheEtiquettesPage = mod('etiquettes_prix')
const SupermarcheFidelitePage   = mod('fidelite_clients')
const SupermarcheAlertesPage    = mod('alertes_pilotage')
const SupermarcheComparatifPage = mod('comparaison_fournisseurs')
const SupermarchePerfCaissiersPage = mod('performance_caissiers')
// Pharmacie & Dépôt Médical (ERP Dédié)
const PharmacieDashboardPage             = safeLazy(() => import('./pages/dashboard/pharmacie/PharmacieDashboardPage'))
const PharmacieCatalogueProduitsPage     = safeLazy(() => import('./pages/dashboard/pharmacie/PharmacieCatalogueProduitsPage'))
const PharmacieStocksLotsPage            = safeLazy(() => import('./pages/dashboard/pharmacie/PharmacieStocksLotsPage'))
const PharmacieVenteComptoirPage         = safeLazy(() => import('./pages/dashboard/pharmacie/PharmacieVenteComptoirPage'))
const PharmacieOrdonnancesPage           = safeLazy(() => import('./pages/dashboard/pharmacie/PharmacieOrdonnancesPage'))
const PharmacieRappelsVigilancePage       = safeLazy(() => import('./pages/dashboard/pharmacie/PharmacieRappelsVigilancePage'))
const PharmacieInventairesTransfertsPage = safeLazy(() => import('./pages/dashboard/pharmacie/PharmacieInventairesTransfertsPage'))
const PharmacieFournisseursCommandesPage = safeLazy(() => import('./pages/dashboard/pharmacie/PharmacieFournisseursCommandesPage'))
const PharmacieRapportsPage              = safeLazy(() => import('./pages/dashboard/pharmacie/PharmacieRapportsPage'))

const OrdonnancesPage    = PharmacieOrdonnancesPage
const LotsPeremptionPage = PharmacieStocksLotsPage
// Station-Service & Hydrocarbures (ERP dédié)
const PompesPage             = safeLazy(() => import('./pages/dashboard/station/PompesCuvesPage'))
const PostesPage             = safeLazy(() => import('./pages/dashboard/station/PostesPompistesPage'))
const FlottesPage            = safeLazy(() => import('./pages/dashboard/station/FlottesClientsPage'))
const AnomaliesPage          = safeLazy(() => import('./pages/dashboard/station/AnomaliesControlesPage'))
const StationDashboardPage   = safeLazy(() => import('./pages/dashboard/station/StationDashboardPage'))
const VenteDistributeurPage  = safeLazy(() => import('./pages/dashboard/station/VenteDistributeurPage'))
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
const RestaurantReportingPage = safeLazy(() => import('./pages/dashboard/restaurant/RestaurantReportingPage'))
// Hôtel
const HotelDashboardPage     = safeLazy(() => import('./pages/dashboard/hotel/HotelDashboardPage'))
const HotelReceptionPage     = safeLazy(() => import('./pages/dashboard/hotel/HotelReceptionPage'))
const HotelChambresPage      = safeLazy(() => import('./pages/dashboard/hotel/HotelChambresPlanningPage'))
const HotelHousekeepingPage  = safeLazy(() => import('./pages/dashboard/hotel/HotelHousekeepingPage'))
const HotelMaintenancePage   = safeLazy(() => import('./pages/dashboard/hotel/HotelMaintenancePage'))
const HotelServicesPage      = safeLazy(() => import('./pages/dashboard/hotel/HotelServicesPage'))
// Transport & Logistique (ERP Dédié Voyageurs & Fret)
const TransportDashboardPage            = safeLazy(() => import('./pages/dashboard/transport/TransportDashboardPage'))
const TransportLignesArretsPage         = safeLazy(() => import('./pages/dashboard/transport/TransportLignesArretsPage'))
const TransportDepartsRotationsPage     = safeLazy(() => import('./pages/dashboard/transport/TransportDepartsRotationsPage'))
const TransportBilletteriePage          = safeLazy(() => import('./pages/dashboard/transport/TransportBilletteriePage'))
const TransportControleTicketsPage      = safeLazy(() => import('./pages/dashboard/transport/TransportControleTicketsPage'))
const TransportParcBusPage              = safeLazy(() => import('./pages/dashboard/transport/TransportParcBusPage'))
const TransportChauffeursPage           = safeLazy(() => import('./pages/dashboard/transport/TransportChauffeursPage'))
const TransportColisPage                = safeLazy(() => import('./pages/dashboard/transport/TransportColisPage'))
const TransportChargementColisPage      = safeLazy(() => import('./pages/dashboard/transport/TransportChargementColisPage'))
const TransportMissionsFretPage         = safeLazy(() => import('./pages/dashboard/transport/TransportMissionsFretPage'))
const TransportCarburantMaintenancePage = safeLazy(() => import('./pages/dashboard/transport/TransportCarburantMaintenancePage'))
// (Hotel Housekeeping replaced by dedicated HotelHousekeepingPage)
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
// Supermarché & Supérette (Caisse Ultra-Rapide)
const SupermarcheCaissePage       = safeLazy(() => import('./pages/dashboard/supermarche/SupermarcheCaissePage'))
// Gestion Locative / Immobilier
const ImmobilierDashboardPage = safeLazy(() => import('./pages/dashboard/immobilier/ImmobilierDashboardPage'))
const BiensPage                 = mod('biens_locations')
const ProprietairesPage         = mod('proprietaires_mandats')
const ContratsPage              = mod('contrats_loyers')
const EtatsLieuxPage            = mod('etats_lieux')
const CautionsPage              = mod('cautions_depots')
const QuittancesPage            = mod('quittances')
const MaintenancesPage          = mod('maintenances_travaux')
const AlertesImmoPage           = mod('alertes_immo')
const ModelesDocumentsPage      = mod('modeles_documents')
// Poissonnerie
const ChambresFroidesPage    = mod('chambres_froides')
const PeseePage              = mod('pesee_cartons')
const AvariesPage            = React.lazy(() => import('./pages/PoissonnerieAvariesPage'))
// Quincaillerie
const MateriauxPage          = mod('materiaux_btp')
const ConversionsPage        = mod('conversions_unites')
const ChantiersPage          = mod('suivi_chantiers')
// Événementiel
const PlanningEvenementsPage = mod('reservations_dates')
const MaterielPage           = mod('location_materiel')
const TraiteurPage           = mod('traiteur_prestations')

// ── Atelier, Garage & BTP Multisite Dédié ──
const GarageSectorDispatcher    = safeLazy(() => import('./pages/dashboard/garage/GarageSectorDispatcher'))
const GarageVehiculesPage       = safeLazy(() => import('./pages/dashboard/garage/GarageVehiculesPage'))
const GarageReceptionPage       = safeLazy(() => import('./pages/dashboard/garage/GarageReceptionPage'))
const GarageReparationsPage     = safeLazy(() => import('./pages/dashboard/garage/GarageReparationsDispatcher'))
const GaragePlanningPage        = safeLazy(() => import('./pages/dashboard/garage/GaragePlanningPage'))
const GarageAssurancesPage      = safeLazy(() => import('./pages/dashboard/garage/GarageAssurancesDispatcher'))
const BtpSitesPage              = safeLazy(() => import('./pages/dashboard/garage/btp/BtpSitesPage'))
const BtpMaterielPage           = safeLazy(() => import('./pages/dashboard/garage/btp/BtpMaterielPage'))
const BtpChantiersPage          = safeLazy(() => import('./pages/dashboard/garage/btp/BtpChantiersPage'))
const BtpMaintenancePage        = safeLazy(() => import('./pages/dashboard/garage/btp/BtpMaintenancePage'))
const BtpCarburantPage          = safeLazy(() => import('./pages/dashboard/garage/btp/BtpCarburantPage'))
const BtpChauffeursPage         = safeLazy(() => import('./pages/dashboard/garage/btp/BtpChauffeursPage'))
const BtpCoutRevientPage        = safeLazy(() => import('./pages/dashboard/garage/btp/BtpCoutRevientPage'))
const BtpTransfertsPage         = safeLazy(() => import('./pages/dashboard/garage/btp/BtpTransfertsPage'))
const BtpMecaniciensPage        = safeLazy(() => import('./pages/dashboard/garage/btp/BtpMecaniciensAffectationPage'))
const BtpLogistiquePage         = safeLazy(() => import('./pages/dashboard/garage/btp/BtpLogistiquePage'))
// ── École & Centre de Formation Dédié ──
const EcoleSectorDispatcher    = safeLazy(() => import('./pages/dashboard/ecole/EcoleSectorDispatcher'))
const EcoleInscriptionsPage    = safeLazy(() => import('./pages/dashboard/ecole/EcoleInscriptionsPage'))
const EcolePedagogiePage       = safeLazy(() => import('./pages/dashboard/ecole/EcolePedagogiePage'))
const EcoleNotesBulletinsPage  = safeLazy(() => import('./pages/dashboard/ecole/EcoleNotesBulletinsPage'))
const EcoleAbsencesPage        = safeLazy(() => import('./pages/dashboard/ecole/EcoleAbsencesPage'))
const EcoleFinancesPage        = safeLazy(() => import('./pages/dashboard/ecole/EcoleFinancesPage'))
const EcoleFormationsProPage   = safeLazy(() => import('./pages/dashboard/ecole/EcoleFormationsProPage'))
const EcoleBibliothequePage    = safeLazy(() => import('./pages/dashboard/ecole/EcoleBibliothequePage'))
// ── Géolocalisation & Flotte Dédié (20ᵉ Activité) ──
const FlotteSectorDispatcher   = safeLazy(() => import('./pages/dashboard/flotte/FlotteSectorDispatcher'))
const FlotteDashboardPage      = safeLazy(() => import('./pages/dashboard/flotte/FlotteDashboardPage'))
const FlotteLiveMapPage        = safeLazy(() => import('./pages/dashboard/flotte/FlotteLiveMapPage'))
const FlotteVehiculesPage      = safeLazy(() => import('./pages/dashboard/flotte/FlotteVehiculesPage'))
const FlotteConducteursPage    = safeLazy(() => import('./pages/dashboard/flotte/FlotteConducteursPage'))
const FlotteMissionsPage       = safeLazy(() => import('./pages/dashboard/flotte/FlotteMissionsPage'))
const FlotteCarburantPage      = safeLazy(() => import('./pages/dashboard/flotte/FlotteCarburantPage'))
const FlotteMaintenancePage    = safeLazy(() => import('./pages/dashboard/flotte/FlotteMaintenancePage'))
const FlotteDocumentsPage      = safeLazy(() => import('./pages/dashboard/flotte/FlotteDocumentsPage'))
const FlotteGeofencesPage      = safeLazy(() => import('./pages/dashboard/flotte/FlotteGeofencesPage'))
const FlotteAlertesPage        = safeLazy(() => import('./pages/dashboard/flotte/FlotteAlertesPage'))
const FlotteCapteursPage       = safeLazy(() => import('./pages/dashboard/flotte/FlotteCapteursPage'))
const FlotteReservationsPage   = safeLazy(() => import('./pages/dashboard/flotte/FlotteReservationsPage'))
const FlotteInspectionsPage    = safeLazy(() => import('./pages/dashboard/flotte/FlotteInspectionsPage'))
const FlotteRapportsPage       = safeLazy(() => import('./pages/dashboard/flotte/FlotteRapportsPage'))
const FlotteIntegrationsGpsPage = safeLazy(() => import('./pages/dashboard/flotte/FlotteIntegrationsGpsPage'))
const FlotteParametresGpsPage  = safeLazy(() => import('./pages/dashboard/flotte/FlotteParametresGpsPage'))

// ─── Loader / Spinner ───────────────────────────────────────────────────────

const FullPageLoader = () => (
  <SplashScreen message="Chargement GESTIO 229..." />
)

// ─── Guards ─────────────────────────────────────────────────────────────────

/**
 * ProtectedRoute / PrivateRoute :
 * Affiche immédiatement un squelette léger (HubSkeleton ou ModuleSkeleton) sans spinner plein écran.
 * Si pas de session => redirige vers /login.
 */
export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, status, company, setCompany } = useAuthStore()
  const location = useLocation()
  const isLoading = status === 'idle' || status === 'loading'

  // Vérification dynamique en arrière-plan du statut de l'entreprise côté serveur
  // Optimisation : vérifie uniquement toutes les 60s, pas à chaque changement de route
  useEffect(() => {
    if (company?.id && status === 'authenticated') {
      const cacheKey = `__gestio_company_check_${company.id}`
      const lastCheck = parseInt(sessionStorage.getItem(cacheKey) || '0', 10)
      const now = Date.now()
      if (now - lastCheck < 60000) return // Pas plus d'une vérification par minute

      try {
        const client = typeof supabase !== 'undefined' ? supabase : (typeof window !== 'undefined' ? (window as any).supabase : null)
        if (client && typeof client.from === 'function') {
          sessionStorage.setItem(cacheKey, String(now))
          client
            .from('companies')
            .select('subscription_status, is_active, suspension_reason')
            .eq('id', company.id)
            .maybeSingle()
            .then(({ data }: any) => {
              if (data) {
                if (
                  data.subscription_status !== company.subscription_status ||
                  data.is_active !== company.is_active ||
                  data.suspension_reason !== (company as any).suspension_reason
                ) {
                  setCompany({
                    ...company,
                    subscription_status: data.subscription_status,
                    is_active: data.is_active,
                    suspension_reason: data.suspension_reason,
                  } as any)
                }
              }
            })
            .catch(() => {})
        }
      } catch (err) {
        console.warn('[ProtectedRoute] Company status check skipped:', err)
      }
    }
  }, [company?.id, status])

  if (isLoading) {
    return location.pathname.includes('/hub') ? <HubSkeleton /> : <ModuleSkeleton />
  }
  if (status === 'unauthenticated' || status === 'error') return <Navigate to="/login" replace />

  // RÈGLE GESTIO 229 : Les utilisateurs internes (caissiers, magasiniers, vendeurs, comptables)
  // n'ont AUCUNE confirmation email requise.
  // Seul l'administrateur avec un compte explicitement non confirmé peut être invité à valider son compte.
  const isAdmin = user?.role === 'administrateur' || user?.role === 'super_admin'
  if (isAdmin && (user as any)?.email_confirmed_at === null) {
    return <Navigate to="/confirm-email" replace state={{ email: user?.email }} />
  }

  // Règle de sécurité absolue : si l'entreprise est bloquée, suspendue ou supprimée, interdire l'accès immédiat
  if (
    company?.subscription_status === 'suspended' ||
    company?.subscription_status === 'deleted' ||
    company?.is_active === false
  ) {
    return <Navigate to="/suspended" replace />
  }

  return <>{children}</>
}

export const PrivateRoute = ProtectedRoute

/**
 * AdminHubGuard : Bloque l'accès au HUB aux utilisateurs internes non-admin
 * Redirige directement vers leur espace d'activité assigné (sans confirmation email requise)
 */
const AdminHubGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, status } = useAuthStore()
  if (status === 'idle' || status === 'loading') return <HubSkeleton />

  const isAdmin = user?.role === 'administrateur' || user?.role === 'super_admin'

  // Si c'est un utilisateur interne : redirection directe et stricte vers son module autorisé (pas de HUB, pas d'email requis)
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

  // Pour l'administrateur uniquement : si email non confirmé
  if ((user as any)?.email_confirmed_at === null) {
    return <Navigate to="/confirm-email" replace state={{ email: user?.email }} />
  }

  return <>{children}</>
}

/**
 * RootRedirect : Redirige intelligemment depuis la racine / selon le profil connecté
 */
const RootRedirect: React.FC = () => {
  const tenantCtx = useAuthStore((s) => s.tenantCtx)
  const target = tenantCtx?.routingDecision?.redirectTo || '/hub'
  return <Navigate to={target} replace />
}

/**
 * PublicRoute : redirige vers /dashboard si déjà connecté
 */
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const status = useAuthStore((s) => s.status)
  const tenantCtx = useAuthStore((s) => s.tenantCtx)

  if (status === 'loading') return <div className="min-h-screen bg-slate-900" />

  const isConfirmationOrSignupReturn = 
    window.location.search.includes('confirmed=') || 
    window.location.search.includes('registered=') ||
    window.location.search.includes('code=') ||
    window.location.hash.includes('access_token')

  if (status === 'authenticated' && !isConfirmationOrSignupReturn) {
    const target = tenantCtx?.routingDecision?.redirectTo || '/hub'
    return <Navigate to={target} replace />
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
  if (clean === 'immobilier' || clean === 'location' || clean === 'gestion-locative' || clean === 'gestion_locative') {
    return <ImmobilierDashboardPage />
  }
  if (clean === 'garage' || clean === 'atelier' || clean === 'mecanique') {
    return <GarageSectorDispatcher />
  }
  if (clean === 'ecole' || clean === 'formation' || clean === 'centre-de-formation' || clean === 'education') {
    return <EcoleSectorDispatcher />
  }
  if (clean === 'hotel' || clean === 'residence' || clean === 'auberge' || clean === 'hotellerie') {
    return <HotelDashboardPage />
  }
  if (clean === 'flotte-geolocalisation' || clean === 'flotte' || clean === 'geolocalisation' || clean === 'gps' || clean === 'geoloc') {
    return <FlotteSectorDispatcher />
  }
  if (clean === 'pharmacie' || clean === 'depot-medical' || clean === 'pharmacie-depot') {
    return <PharmacieDashboardPage />
  }
  return <DashboardPage />
}

// ─── Vente & POS conditionnel (Spécialisé Vente Rapide pour Imprimerie & Caisse Supermarché) ───
const SectorAwareVentes: React.FC = () => {
  const { sectorSlug } = useTenant()
  const clean = (sectorSlug || getActiveSectorSlug() || '').toLowerCase().trim().replace(/^sec-/, '')
  if (clean === 'imprimerie' || clean === 'impression') {
    return <ImprimerieVenteRapidePage />
  }
  if (clean === 'supermarche' || clean === 'superette' || clean === 'supermarche-alimentation' || clean === 'supérette') {
    return <SupermarcheCaissePage />
  }
  if (clean === 'pharmacie' || clean === 'depot-medical' || clean === 'pharmacie-depot') {
    return <PharmacieVenteComptoirPage />
  }
  return <POSPage />
}

// ─── Stocks conditionnel (Spécialisé Matières Premières & Bobines Imprimerie) ────
const SectorAwareStocks: React.FC = () => {
  const { sectorSlug } = useTenant()
  const clean = (sectorSlug || getActiveSectorSlug() || '').toLowerCase().trim().replace(/^sec-/, '')
  if (clean === 'imprimerie' || clean === 'impression') {
    return <ImprimerieMatieresPage />
  }
  if (clean === 'pharmacie' || clean === 'depot-medical' || clean === 'pharmacie-depot') {
    return <PharmacieStocksLotsPage />
  }
  return <StocksPage />
}

// ─── Reporting conditionnel (Spécialisé Rentabilité par Prestation Imprimerie & CHR Bar/Resto) ────
const SectorAwareReporting: React.FC = () => {
  const { sectorSlug } = useTenant()
  const clean = sectorSlug ? sectorSlug.toLowerCase().trim().replace(/^sec-/, '') : ''
  if (clean === 'imprimerie' || clean === 'impression') {
    return <ImprimerieReportingPage />
  }
  if (clean === 'restaurant' || clean === 'bar-restaurant-maquis' || clean === 'bar' || clean === 'maquis' || clean === 'fastfood') {
    return <RestaurantReportingPage />
  }
  if (clean === 'pharmacie' || clean === 'depot-medical' || clean === 'pharmacie-depot') {
    return <PharmacieRapportsPage />
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
  if (clean === 'pharmacie' || clean === 'depot-medical' || clean === 'pharmacie-depot') {
    return <PharmacieFournisseursCommandesPage />
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

// ─── Grilles Gros & Maquis conditionnel (Dédié Brasserie & Dépôt de Boissons) ──
const SectorAwareGrilles: React.FC = () => {
  const { sectorSlug } = useTenant()
  const clean = sectorSlug ? sectorSlug.toLowerCase().trim().replace(/^sec-/, '') : ''
  if (clean === 'brasserie' || clean === 'brasserie-depot-boissons' || clean === 'depot-boissons') {
    return <BrasserieGrillesPage />
  }
  return <GrillesPage />
}

// ─── Véhicules conditionnels (Garage vs Flotte GPS) ──────────────────────────
const SectorAwareVehicules: React.FC = () => {
  const { sectorSlug } = useTenant()
  const clean = (sectorSlug || getActiveSectorSlug() || '').toLowerCase().trim().replace(/^sec-/, '')
  if (clean === 'hotel' || clean === 'residence' || clean === 'auberge' || clean === 'hotellerie') {
    return <HotelDashboardPage />
  }
  if (clean === 'flotte-geolocalisation' || clean === 'flotte' || clean === 'geolocalisation' || clean === 'gps' || clean === 'geoloc') {
    return <FlotteVehiculesPage />
  }
  return <GarageVehiculesPage />
}

// ─── Réservations conditionnelles (Bar/Resto/Hôtel vs Autopartage Flotte) ────
const SectorAwareReservations: React.FC = () => {
  const { sectorSlug } = useTenant()
  const clean = (sectorSlug || getActiveSectorSlug() || '').toLowerCase().trim().replace(/^sec-/, '')
  if (clean === 'hotel' || clean === 'residence' || clean === 'auberge' || clean === 'hotellerie') {
    return <HotelChambresPage />
  }
  if (clean === 'flotte-geolocalisation' || clean === 'flotte' || clean === 'geolocalisation' || clean === 'gps' || clean === 'geoloc') {
    return <FlotteReservationsPage />
  }
  return <ReservationsPage />
}

// ─── Alertes conditionnelles (Immobilier vs Flotte GPS) ──────────────────────
const SectorAwareAlertes: React.FC = () => {
  const { sectorSlug } = useTenant()
  const clean = (sectorSlug || getActiveSectorSlug() || '').toLowerCase().trim().replace(/^sec-/, '')
  if (clean === 'hotel' || clean === 'residence' || clean === 'auberge' || clean === 'hotellerie') {
    return <HotelDashboardPage />
  }
  if (clean === 'flotte-geolocalisation' || clean === 'flotte' || clean === 'geolocalisation' || clean === 'gps' || clean === 'geoloc') {
    return <FlotteAlertesPage />
  }
  return <AlertesImmoPage />
}

// ─── Documents conditionnels (Flotte vs Général) ─────────────────────────────
const SectorAwareDocuments: React.FC = () => {
  const { sectorSlug } = useTenant()
  const clean = (sectorSlug || getActiveSectorSlug() || '').toLowerCase().trim().replace(/^sec-/, '')
  if (clean === 'hotel' || clean === 'residence' || clean === 'auberge' || clean === 'hotellerie') {
    return <HotelDashboardPage />
  }
  if (clean === 'flotte-geolocalisation' || clean === 'flotte' || clean === 'geolocalisation' || clean === 'gps' || clean === 'geoloc') {
    return <FlotteDocumentsPage />
  }
  return <FlotteDocumentsPage />
}

// ─── Réception conditionnelle (Hôtel vs Garage) ──────────────────────────────
const SectorAwareReception: React.FC = () => {
  const { sectorSlug } = useTenant()
  const clean = (sectorSlug || getActiveSectorSlug() || '').toLowerCase().trim().replace(/^sec-/, '')
  if (clean === 'hotel' || clean === 'residence' || clean === 'auberge' || clean === 'hotellerie') {
    return <HotelReceptionPage />
  }
  return <ModuleGuard moduleId="reception_diagnostic"><GarageReceptionPage /></ModuleGuard>
}

// ─── Maintenance conditionnelle (Hôtel vs Flotte) ────────────────────────────
const SectorAwareMaintenance: React.FC = () => {
  const { sectorSlug } = useTenant()
  const clean = (sectorSlug || getActiveSectorSlug() || '').toLowerCase().trim().replace(/^sec-/, '')
  if (clean === 'hotel' || clean === 'residence' || clean === 'auberge' || clean === 'hotellerie') {
    return <HotelMaintenancePage />
  }
  return <ModuleGuard moduleId="flotte_maintenance"><FlotteMaintenancePage /></ModuleGuard>
}

// ─── Initialisation globale ─────────────────────────────────────────────────

const AppInitializer: React.FC = () => {
  const initialize = useAuthStore((s) => s.initialize)
  const company = useAuthStore((s) => s.company)

  useEffect(() => {
    initialize()
  }, [initialize])

  // Dissoudre en douceur le Splash Screen natif HTML dès que React est monté
  useEffect(() => {
    const splash = document.getElementById('gestio-pwa-splash')
    if (splash) {
      splash.style.opacity = '0'
      splash.style.pointerEvents = 'none'
      setTimeout(() => {
        splash.remove()
      }, 400)
    }
  }, [])

  // Au repos (idle), précharger les modules fréquents sans bloquer le fil d'exécution
  useEffect(() => {
    if (company?.id) {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => {
          preloadCommonModules()
        })
      } else {
        setTimeout(() => {
          preloadCommonModules()
        }, 1200)
      }
    }
  }, [company?.id])

  return null
}

// ─── Page Suspendu / Essai Expiré ────────────────────────────────────────────

const SuspendedPage = () => {
  const company = useAuthStore((s) => s.company)
  const logout = useAuthStore((s) => s.logout)
  const isDeleted = company?.subscription_status === 'deleted'
  const isSuspended = company?.subscription_status === 'suspended' || company?.is_active === false
  const reason = (company as any)?.suspension_reason

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="bg-slate-800 rounded-3xl shadow-2xl border border-slate-700 p-8 sm:p-10 max-w-md w-full text-center">
        <div
          className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm text-3xl ${
            isDeleted
              ? 'bg-red-950/80 text-red-400 border border-red-700'
              : 'bg-amber-950/80 text-amber-400 border border-amber-700'
          }`}
        >
          {isDeleted ? '🗑️' : '🔒'}
        </div>
        <h1 className="text-2xl font-black text-white mb-2">
          {isDeleted
            ? 'Entreprise Désactivée'
            : isSuspended
            ? 'Accès à l\'Entreprise Suspendu'
            : "Période d'Essai de 30 Jours Expirée"}
        </h1>
        <p className="text-slate-300 text-sm mb-4 leading-relaxed">
          {isDeleted
            ? `L'accès à l'entreprise « ${company?.name || 'votre entreprise'} » a été désactivé par l'administration de la plateforme GESTIO229. Vos données (ventes, achats, stocks, comptabilité) restent intégralement conservées en toute sécurité.`
            : isSuspended
            ? `L'accès à l'espace de travail de « ${company?.name || 'votre entreprise'} » est actuellement suspendu par le Super Administrateur. Toutes vos données sont strictement conservées.`
            : `Votre période d'essai gratuit de 30 jours pour ${company?.name || 'votre entreprise'} est arrivée à échéance. Veuillez activer votre abonnement pour débloquer l'accès à vos données.`}
        </p>

        {reason && (
          <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-3 mb-5 text-xs text-left">
            <span className="text-slate-400 block font-semibold mb-0.5">Motif communiqué :</span>
            <span className="text-amber-300 font-medium">{reason}</span>
          </div>
        )}

        <div className="bg-slate-900/60 border border-slate-700/80 rounded-xl p-3 mb-6 text-xs text-slate-400">
          Pour toute demande de régularisation ou de rétablissement d'accès, veuillez contacter l'administrateur de la plateforme GESTIO229.
        </div>

        <div className="flex flex-col gap-3">
          {!isDeleted && !isSuspended && (
            <Link
              to="/dashboard/abonnement"
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition"
            >
              Consulter les Formules & Renouveler
            </Link>
          )}
          <a
            href="mailto:support@gestio229.com"
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs transition"
          >
            Contacter le Concepteur / Support
          </a>
          <button
            onClick={logout}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white font-semibold text-xs transition"
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
      {/* Racine : Redirection intelligente vers le Hub ou le secteur actif */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <RootRedirect />
          </ProtectedRoute>
        }
      />

      {/* Routes publiques */}
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/connexion" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/inscription" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/confirm-email" element={<ConfirmEmailPage />} />
      <Route path="/confirmer-email" element={<Navigate to="/confirm-email" replace />} />

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
        <Route path="vendeur"        element={<ModuleGuard moduleId="vendeur"><VendeurPage /></ModuleGuard>} />
        <Route path="prise-commande" element={<ModuleGuard moduleId="vendeur"><VendeurPage /></ModuleGuard>} />
        <Route path="bons-commande"  element={<ModuleGuard moduleId="vendeur"><VendeurPage /></ModuleGuard>} />
        <Route path="stocks"         element={<ModuleGuard moduleId="stock"><SectorAwareStocks /></ModuleGuard>} />
        <Route path="caisse"         element={<ModuleGuard moduleId="caisse"><CaissePage /></ModuleGuard>} />
        <Route path="cloture-caisse" element={<ModuleGuard moduleId="caisse"><ClotureCaisse /></ModuleGuard>} />
        <Route path="cloture"        element={<ModuleGuard moduleId="caisse"><ClotureCaisse /></ModuleGuard>} />
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
        <Route path="grilles"         element={<ModuleGuard moduleId="grilles_tarifaires"><SectorAwareGrilles /></ModuleGuard>} />
        {/* ── Modules École & Formation Dédié ── */}
        <Route path="eleves"          element={<ModuleGuard moduleId="eleves"><EcoleInscriptionsPage /></ModuleGuard>} />
        <Route path="inscriptions"    element={<ModuleGuard moduleId="eleves"><EcoleInscriptionsPage /></ModuleGuard>} />
        <Route path="pedagogie"       element={<ModuleGuard moduleId="pedagogie"><EcolePedagogiePage /></ModuleGuard>} />
        <Route path="frais"           element={<ModuleGuard moduleId="frais_scolaires"><EcoleFinancesPage /></ModuleGuard>} />
        <Route path="notes"           element={<ModuleGuard moduleId="notes_resultats"><EcoleNotesBulletinsPage /></ModuleGuard>} />
        <Route path="absences"        element={<ModuleGuard moduleId="absences"><EcoleAbsencesPage /></ModuleGuard>} />
        <Route path="formations-pro"  element={<ModuleGuard moduleId="formations_pro"><EcoleFormationsProPage /></ModuleGuard>} />
        <Route path="bibliotheque"    element={<ModuleGuard moduleId="bibliotheque"><EcoleBibliothequePage /></ModuleGuard>} />
        {/* ── Modules Supermarché ── */}
        <Route path="rayons"                  element={<ModuleGuard moduleId="rayons_gondoles"><RayonsPage /></ModuleGuard>} />
        <Route path="promos-dlc"              element={<ModuleGuard moduleId="promos_dlc_courtes"><PromosDLCPage /></ModuleGuard>} />
        <Route path="inventaire"              element={<ModuleGuard moduleId="inventaire_supermarche"><SupermarcheInventairePage /></ModuleGuard>} />
        <Route path="reapprovisionnement"     element={<ModuleGuard moduleId="reappro_intelligent"><SupermarcheReapproPage /></ModuleGuard>} />
        <Route path="etiquettes"              element={<ModuleGuard moduleId="etiquettes_prix"><SupermarcheEtiquettesPage /></ModuleGuard>} />
        <Route path="fidelite"                element={<ModuleGuard moduleId="fidelite_clients"><SupermarcheFidelitePage /></ModuleGuard>} />
        <Route path="pilotage-alertes"        element={<ModuleGuard moduleId="alertes_pilotage"><SupermarcheAlertesPage /></ModuleGuard>} />
        <Route path="comparatif-fournisseurs" element={<ModuleGuard moduleId="comparaison_fournisseurs"><SupermarcheComparatifPage /></ModuleGuard>} />
        <Route path="performance-caissiers"   element={<ModuleGuard moduleId="performance_caissiers"><SupermarchePerfCaissiersPage /></ModuleGuard>} />
        {/* ── Modules Pharmacie & Dépôt Médical ── */}
        <Route path="ordonnances" element={<ModuleGuard moduleId="ordonnances"><PharmacieOrdonnancesPage /></ModuleGuard>} />
        <Route path="lots"        element={<ModuleGuard moduleId="lots_peremption"><PharmacieStocksLotsPage /></ModuleGuard>} />
        <Route path="catalogue"   element={<ModuleGuard moduleId="catalogue_pharmacie"><PharmacieCatalogueProduitsPage /></ModuleGuard>} />
        <Route path="inventaires" element={<ModuleGuard moduleId="inventaires_pharmacie"><PharmacieInventairesTransfertsPage /></ModuleGuard>} />
        <Route path="vigilance"   element={<ModuleGuard moduleId="vigilance_pharmacie"><PharmacieRappelsVigilancePage /></ModuleGuard>} />
        <Route path="commandes"   element={<ModuleGuard moduleId="commandes_pharmacie"><PharmacieFournisseursCommandesPage /></ModuleGuard>} />
        {/* ── Modules Station-Service & Hydrocarbures ── */}
        <Route path="pompes"      element={<ModuleGuard moduleId="pompes_cuves"><PompesPage /></ModuleGuard>} />
        <Route path="cuves"       element={<ModuleGuard moduleId="pompes_cuves"><PompesPage /></ModuleGuard>} />
        <Route path="jaugeages"   element={<ModuleGuard moduleId="pompes_cuves"><PompesPage /></ModuleGuard>} />
        <Route path="receptions"  element={<ModuleGuard moduleId="pompes_cuves"><PompesPage /></ModuleGuard>} />
        <Route path="vente-distributeur" element={<ModuleGuard moduleId="ventes"><VenteDistributeurPage /></ModuleGuard>} />
        <Route path="distributeur" element={<ModuleGuard moduleId="ventes"><VenteDistributeurPage /></ModuleGuard>} />
        <Route path="postes"      element={<ModuleGuard moduleId="postes_pompiste"><PostesPage /></ModuleGuard>} />
        <Route path="flottes"     element={<ModuleGuard moduleId="flottes_vehicules"><FlottesPage /></ModuleGuard>} />
        <Route path="anomalies"   element={<ModuleGuard moduleId="anomalies_controles"><AnomaliesPage /></ModuleGuard>} />
        <Route path="lubrifiants" element={<ModuleGuard moduleId="lubrifiants"><LubrifiantsPage /></ModuleGuard>} />
        {/* ── Modules Bar, Restaurant, Maquis & Fast-Food ── */}
        <Route path="tables"       element={<ModuleGuard moduleId="tables_plan"><TablesPlanPage /></ModuleGuard>} />
        <Route path="cuisine-bar"  element={<ModuleGuard moduleId="cuisine_bar"><CuisineBarKDSPage /></ModuleGuard>} />
        <Route path="recettes"     element={<ModuleGuard moduleId="recettes"><RecettesFichesPage /></ModuleGuard>} />
        <Route path="reservations" element={<ModuleGuard moduleId="reservations"><SectorAwareReservations /></ModuleGuard>} />
        <Route path="pertes"       element={<ModuleGuard moduleId="pertes_gaspillage"><PertesGaspillagePage /></ModuleGuard>} />
        <Route path="serveurs"     element={<ModuleGuard moduleId="serveurs"><ServeursPersonnelPage /></ModuleGuard>} />
        <Route path="evenements"   element={<ModuleGuard moduleId="evenements"><EvenementsPage /></ModuleGuard>} />
        {/* ── Modules Hôtel ── */}
        <Route path="reception"              element={<SectorAwareReception />} />
        <Route path="chambres"               element={<ModuleGuard moduleId="chambres_reservations"><HotelChambresPage /></ModuleGuard>} />
        <Route path="housekeeping"           element={<ModuleGuard moduleId="housekeeping"><HotelHousekeepingPage /></ModuleGuard>} />
        <Route path="maintenance-hotel"      element={<ModuleGuard moduleId="maintenance_hotel"><HotelMaintenancePage /></ModuleGuard>} />
        <Route path="services-consommations" element={<ModuleGuard moduleId="services_consommations"><HotelServicesPage /></ModuleGuard>} />
        {/* ── Modules Transport de Voyageurs & Logistique ── */}
        <Route path="lignes-arrets"          element={<TransportLignesArretsPage />} />
        <Route path="departs-rotations"      element={<TransportDepartsRotationsPage />} />
        <Route path="billetterie-bus"        element={<TransportBilletteriePage />} />
        <Route path="controle-tickets"       element={<TransportControleTicketsPage />} />
        <Route path="flotte-bus"             element={<TransportParcBusPage />} />
        <Route path="chauffeurs-equipage"    element={<TransportChauffeursPage />} />
        <Route path="colis-expeditions"      element={<TransportColisPage />} />
        <Route path="chargement-colis"       element={<TransportChargementColisPage />} />
        <Route path="missions-transport"     element={<TransportMissionsFretPage />} />
        <Route path="carburant-maintenance"  element={<TransportCarburantMaintenancePage />} />
        {/* ── Modules Garage Classic ── */}
        <Route path="vehicules"              element={<SectorAwareVehicules />} />
        <Route path="reparations"            element={<ModuleGuard moduleId="ordres_reparation"><GarageReparationsPage /></ModuleGuard>} />
        <Route path="planning-atelier"       element={<ModuleGuard moduleId="planning_atelier"><GaragePlanningPage /></ModuleGuard>} />
        <Route path="assurances-sinistres"   element={<ModuleGuard moduleId="assurances_sinistres"><GarageAssurancesPage /></ModuleGuard>} />
        {/* ── Modules Garage BTP Multisite ── */}
        <Route path="organisation-multisite" element={<ModuleGuard moduleId="btp_sites"><BtpSitesPage /></ModuleGuard>} />
        <Route path="parc-materiel"          element={<ModuleGuard moduleId="btp_materiel"><BtpMaterielPage /></ModuleGuard>} />
        <Route path="chantiers-affectations" element={<ModuleGuard moduleId="btp_chantiers"><BtpChantiersPage /></ModuleGuard>} />
        <Route path="transferts-intersites"  element={<ModuleGuard moduleId="btp_transferts"><BtpTransfertsPage /></ModuleGuard>} />
        <Route path="affectation-mecaniciens" element={<ModuleGuard moduleId="btp_mecaniciens"><BtpMecaniciensPage /></ModuleGuard>} />
        <Route path="logistique-parc"        element={<ModuleGuard moduleId="btp_logistique"><BtpLogistiquePage /></ModuleGuard>} />
        <Route path="maintenance-preventive" element={<ModuleGuard moduleId="btp_maintenance"><BtpMaintenancePage /></ModuleGuard>} />
        <Route path="carburant-lubrifiants"  element={<ModuleGuard moduleId="btp_carburant"><BtpCarburantPage /></ModuleGuard>} />
        <Route path="chauffeurs-operateurs"  element={<ModuleGuard moduleId="btp_chauffeurs"><BtpChauffeursPage /></ModuleGuard>} />
        <Route path="couts-revient"          element={<ModuleGuard moduleId="btp_couts"><BtpCoutRevientPage /></ModuleGuard>} />
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
        <Route path="vente-express"  element={<Navigate to="../vente-rapide" replace />} />
        {/* ── Modules Gestion Locative & Immobilière ── */}
        <Route path="biens"              element={<ModuleGuard moduleId="biens_locations"><BiensPage /></ModuleGuard>} />
        <Route path="proprietaires"      element={<ModuleGuard moduleId="proprietaires_mandats"><ProprietairesPage /></ModuleGuard>} />
        <Route path="contrats"           element={<ModuleGuard moduleId="contrats_loyers"><ContratsPage /></ModuleGuard>} />
        <Route path="etats-lieux"        element={<ModuleGuard moduleId="etats_lieux"><EtatsLieuxPage /></ModuleGuard>} />
        <Route path="cautions"           element={<ModuleGuard moduleId="cautions_depots"><CautionsPage /></ModuleGuard>} />
        <Route path="quittances"         element={<ModuleGuard moduleId="quittances"><QuittancesPage /></ModuleGuard>} />
        <Route path="maintenances"       element={<ModuleGuard moduleId="maintenances_travaux"><MaintenancesPage /></ModuleGuard>} />
        <Route path="alertes"            element={<SectorAwareAlertes />} />
        <Route path="modeles-documents"  element={<ModuleGuard moduleId="modeles_documents"><ModelesDocumentsPage /></ModuleGuard>} />
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
        {/* ── Modules Géolocalisation & Flotte (20ᵉ Activité) ── */}
        <Route path="live-map"         element={<ModuleGuard moduleId="flotte_carte"><FlotteLiveMapPage /></ModuleGuard>} />
        <Route path="carte"            element={<ModuleGuard moduleId="flotte_carte"><FlotteLiveMapPage /></ModuleGuard>} />
        <Route path="flotte-carte"     element={<ModuleGuard moduleId="flotte_carte"><FlotteLiveMapPage /></ModuleGuard>} />
        <Route path="parc-vehicules"   element={<ModuleGuard moduleId="flotte_vehicules"><FlotteVehiculesPage /></ModuleGuard>} />
        <Route path="conducteurs"      element={<ModuleGuard moduleId="flotte_conducteurs"><FlotteConducteursPage /></ModuleGuard>} />
        <Route path="missions"         element={<ModuleGuard moduleId="flotte_missions"><FlotteMissionsPage /></ModuleGuard>} />
        <Route path="carburant"        element={<ModuleGuard moduleId="flotte_carburant"><FlotteCarburantPage /></ModuleGuard>} />
        <Route path="maintenance"      element={<SectorAwareMaintenance />} />
        <Route path="documents"        element={<ModuleGuard moduleId="flotte_documents"><SectorAwareDocuments /></ModuleGuard>} />
        <Route path="geofences"        element={<ModuleGuard moduleId="flotte_geofences"><FlotteGeofencesPage /></ModuleGuard>} />
        <Route path="capteurs"         element={<ModuleGuard moduleId="flotte_capteurs"><FlotteCapteursPage /></ModuleGuard>} />
        <Route path="inspections"      element={<ModuleGuard moduleId="flotte_inspections"><FlotteInspectionsPage /></ModuleGuard>} />
        <Route path="rapports-flotte"  element={<ModuleGuard moduleId="flotte_rapports"><FlotteRapportsPage /></ModuleGuard>} />
        <Route path="integrations-gps" element={<ModuleGuard moduleId="flotte_integrations"><FlotteIntegrationsGpsPage /></ModuleGuard>} />
        <Route path="parametres-gps"   element={<ModuleGuard moduleId="flotte_parametres"><FlotteParametresGpsPage /></ModuleGuard>} />
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
        <Route path="vendeur"        element={<ModuleGuard moduleId="vendeur"><VendeurPage /></ModuleGuard>} />
        <Route path="prise-commande" element={<ModuleGuard moduleId="vendeur"><VendeurPage /></ModuleGuard>} />
        <Route path="bons-commande"  element={<ModuleGuard moduleId="vendeur"><VendeurPage /></ModuleGuard>} />
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
        <Route path="grilles"         element={<ModuleGuard moduleId="grilles_tarifaires"><SectorAwareGrilles /></ModuleGuard>} />
        {/* ── Modules École & Formation Dédié ── */}
        <Route path="eleves"          element={<ModuleGuard moduleId="eleves"><EcoleInscriptionsPage /></ModuleGuard>} />
        <Route path="inscriptions"    element={<ModuleGuard moduleId="eleves"><EcoleInscriptionsPage /></ModuleGuard>} />
        <Route path="pedagogie"       element={<ModuleGuard moduleId="pedagogie"><EcolePedagogiePage /></ModuleGuard>} />
        <Route path="frais"           element={<ModuleGuard moduleId="frais_scolaires"><EcoleFinancesPage /></ModuleGuard>} />
        <Route path="notes"           element={<ModuleGuard moduleId="notes_resultats"><EcoleNotesBulletinsPage /></ModuleGuard>} />
        <Route path="absences"        element={<ModuleGuard moduleId="absences"><EcoleAbsencesPage /></ModuleGuard>} />
        <Route path="formations-pro"  element={<ModuleGuard moduleId="formations_pro"><EcoleFormationsProPage /></ModuleGuard>} />
        <Route path="bibliotheque"    element={<ModuleGuard moduleId="bibliotheque"><EcoleBibliothequePage /></ModuleGuard>} />
        {/* ── Modules Supermarché ── */}
        <Route path="rayons"                  element={<ModuleGuard moduleId="rayons_gondoles"><RayonsPage /></ModuleGuard>} />
        <Route path="promos-dlc"              element={<ModuleGuard moduleId="promos_dlc_courtes"><PromosDLCPage /></ModuleGuard>} />
        <Route path="inventaire"              element={<ModuleGuard moduleId="inventaire_supermarche"><SupermarcheInventairePage /></ModuleGuard>} />
        <Route path="reapprovisionnement"     element={<ModuleGuard moduleId="reappro_intelligent"><SupermarcheReapproPage /></ModuleGuard>} />
        <Route path="etiquettes"              element={<ModuleGuard moduleId="etiquettes_prix"><SupermarcheEtiquettesPage /></ModuleGuard>} />
        <Route path="fidelite"                element={<ModuleGuard moduleId="fidelite_clients"><SupermarcheFidelitePage /></ModuleGuard>} />
        <Route path="pilotage-alertes"        element={<ModuleGuard moduleId="alertes_pilotage"><SupermarcheAlertesPage /></ModuleGuard>} />
        <Route path="comparatif-fournisseurs" element={<ModuleGuard moduleId="comparaison_fournisseurs"><SupermarcheComparatifPage /></ModuleGuard>} />
        <Route path="performance-caissiers"   element={<ModuleGuard moduleId="performance_caissiers"><SupermarchePerfCaissiersPage /></ModuleGuard>} />
        {/* ── Modules Pharmacie & Dépôt Médical ── */}
        <Route path="ordonnances" element={<ModuleGuard moduleId="ordonnances"><PharmacieOrdonnancesPage /></ModuleGuard>} />
        <Route path="lots"        element={<ModuleGuard moduleId="lots_peremption"><PharmacieStocksLotsPage /></ModuleGuard>} />
        <Route path="catalogue"   element={<ModuleGuard moduleId="catalogue_pharmacie"><PharmacieCatalogueProduitsPage /></ModuleGuard>} />
        <Route path="inventaires" element={<ModuleGuard moduleId="inventaires_pharmacie"><PharmacieInventairesTransfertsPage /></ModuleGuard>} />
        <Route path="vigilance"   element={<ModuleGuard moduleId="vigilance_pharmacie"><PharmacieRappelsVigilancePage /></ModuleGuard>} />
        <Route path="commandes"   element={<ModuleGuard moduleId="commandes_pharmacie"><PharmacieFournisseursCommandesPage /></ModuleGuard>} />
        {/* ── Modules Station-Service & Hydrocarbures ── */}
        <Route path="pompes"      element={<ModuleGuard moduleId="pompes_cuves"><PompesPage /></ModuleGuard>} />
        <Route path="cuves"       element={<ModuleGuard moduleId="pompes_cuves"><PompesPage /></ModuleGuard>} />
        <Route path="jaugeages"   element={<ModuleGuard moduleId="pompes_cuves"><PompesPage /></ModuleGuard>} />
        <Route path="receptions"  element={<ModuleGuard moduleId="pompes_cuves"><PompesPage /></ModuleGuard>} />
        <Route path="vente-distributeur" element={<ModuleGuard moduleId="ventes"><VenteDistributeurPage /></ModuleGuard>} />
        <Route path="distributeur" element={<ModuleGuard moduleId="ventes"><VenteDistributeurPage /></ModuleGuard>} />
        <Route path="postes"      element={<ModuleGuard moduleId="postes_pompiste"><PostesPage /></ModuleGuard>} />
        <Route path="flottes"     element={<ModuleGuard moduleId="flottes_vehicules"><FlottesPage /></ModuleGuard>} />
        <Route path="anomalies"   element={<ModuleGuard moduleId="anomalies_controles"><AnomaliesPage /></ModuleGuard>} />
        <Route path="lubrifiants" element={<ModuleGuard moduleId="lubrifiants"><LubrifiantsPage /></ModuleGuard>} />
        {/* ── Modules Bar, Restaurant, Maquis & Fast-Food ── */}
        <Route path="tables"       element={<ModuleGuard moduleId="tables_plan"><TablesPlanPage /></ModuleGuard>} />
        <Route path="cuisine-bar"  element={<ModuleGuard moduleId="cuisine_bar"><CuisineBarKDSPage /></ModuleGuard>} />
        <Route path="recettes"     element={<ModuleGuard moduleId="recettes"><RecettesFichesPage /></ModuleGuard>} />
        <Route path="reservations" element={<ModuleGuard moduleId="reservations"><SectorAwareReservations /></ModuleGuard>} />
        <Route path="pertes"       element={<ModuleGuard moduleId="pertes_gaspillage"><PertesGaspillagePage /></ModuleGuard>} />
        <Route path="serveurs"     element={<ModuleGuard moduleId="serveurs"><ServeursPersonnelPage /></ModuleGuard>} />
        <Route path="evenements"   element={<ModuleGuard moduleId="evenements"><EvenementsPage /></ModuleGuard>} />
        {/* ── Modules Hôtel ── */}
        <Route path="reception"              element={<SectorAwareReception />} />
        <Route path="chambres"               element={<ModuleGuard moduleId="chambres_reservations"><HotelChambresPage /></ModuleGuard>} />
        <Route path="housekeeping"           element={<ModuleGuard moduleId="housekeeping"><HotelHousekeepingPage /></ModuleGuard>} />
        <Route path="maintenance-hotel"      element={<ModuleGuard moduleId="maintenance_hotel"><HotelMaintenancePage /></ModuleGuard>} />
        <Route path="services-consommations" element={<ModuleGuard moduleId="services_consommations"><HotelServicesPage /></ModuleGuard>} />
        {/* ── Modules Transport de Voyageurs & Logistique ── */}
        <Route path="lignes-arrets"          element={<TransportLignesArretsPage />} />
        <Route path="departs-rotations"      element={<TransportDepartsRotationsPage />} />
        <Route path="billetterie-bus"        element={<TransportBilletteriePage />} />
        <Route path="controle-tickets"       element={<TransportControleTicketsPage />} />
        <Route path="flotte-bus"             element={<TransportParcBusPage />} />
        <Route path="chauffeurs-equipage"    element={<TransportChauffeursPage />} />
        <Route path="colis-expeditions"      element={<TransportColisPage />} />
        <Route path="chargement-colis"       element={<TransportChargementColisPage />} />
        <Route path="missions-transport"     element={<TransportMissionsFretPage />} />
        <Route path="carburant-maintenance"  element={<TransportCarburantMaintenancePage />} />
        {/* ── Modules Garage Classic ── */}
        <Route path="vehicules"              element={<SectorAwareVehicules />} />
        <Route path="reparations"            element={<ModuleGuard moduleId="ordres_reparation"><GarageReparationsPage /></ModuleGuard>} />
        <Route path="planning-atelier"       element={<ModuleGuard moduleId="planning_atelier"><GaragePlanningPage /></ModuleGuard>} />
        <Route path="assurances-sinistres"   element={<ModuleGuard moduleId="assurances_sinistres"><GarageAssurancesPage /></ModuleGuard>} />
        {/* ── Modules Garage BTP Multisite ── */}
        <Route path="organisation-multisite" element={<ModuleGuard moduleId="btp_sites"><BtpSitesPage /></ModuleGuard>} />
        <Route path="parc-materiel"          element={<ModuleGuard moduleId="btp_materiel"><BtpMaterielPage /></ModuleGuard>} />
        <Route path="chantiers-affectations" element={<ModuleGuard moduleId="btp_chantiers"><BtpChantiersPage /></ModuleGuard>} />
        <Route path="transferts-intersites"  element={<ModuleGuard moduleId="btp_transferts"><BtpTransfertsPage /></ModuleGuard>} />
        <Route path="affectation-mecaniciens" element={<ModuleGuard moduleId="btp_mecaniciens"><BtpMecaniciensPage /></ModuleGuard>} />
        <Route path="logistique-parc"        element={<ModuleGuard moduleId="btp_logistique"><BtpLogistiquePage /></ModuleGuard>} />
        <Route path="maintenance-preventive" element={<ModuleGuard moduleId="btp_maintenance"><BtpMaintenancePage /></ModuleGuard>} />
        <Route path="carburant-lubrifiants"  element={<ModuleGuard moduleId="btp_carburant"><BtpCarburantPage /></ModuleGuard>} />
        <Route path="chauffeurs-operateurs"  element={<ModuleGuard moduleId="btp_chauffeurs"><BtpChauffeursPage /></ModuleGuard>} />
        <Route path="couts-revient"          element={<ModuleGuard moduleId="btp_couts"><BtpCoutRevientPage /></ModuleGuard>} />
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
        <Route path="vente-express"  element={<Navigate to="../vente-rapide" replace />} />
        {/* ── Modules Gestion Locative & Immobilière ── */}
        <Route path="biens"              element={<ModuleGuard moduleId="biens_locations"><BiensPage /></ModuleGuard>} />
        <Route path="proprietaires"      element={<ModuleGuard moduleId="proprietaires_mandats"><ProprietairesPage /></ModuleGuard>} />
        <Route path="contrats"           element={<ModuleGuard moduleId="contrats_loyers"><ContratsPage /></ModuleGuard>} />
        <Route path="etats-lieux"        element={<ModuleGuard moduleId="etats_lieux"><EtatsLieuxPage /></ModuleGuard>} />
        <Route path="cautions"           element={<ModuleGuard moduleId="cautions_depots"><CautionsPage /></ModuleGuard>} />
        <Route path="quittances"         element={<ModuleGuard moduleId="quittances"><QuittancesPage /></ModuleGuard>} />
        <Route path="maintenances"       element={<ModuleGuard moduleId="maintenances_travaux"><MaintenancesPage /></ModuleGuard>} />
        <Route path="alertes"            element={<SectorAwareAlertes />} />
        <Route path="modeles-documents"  element={<ModuleGuard moduleId="modeles_documents"><ModelesDocumentsPage /></ModuleGuard>} />
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
        {/* ── Modules Géolocalisation & Flotte (20ᵉ Activité) ── */}
        <Route path="live-map"         element={<ModuleGuard moduleId="flotte_carte"><FlotteLiveMapPage /></ModuleGuard>} />
        <Route path="carte"            element={<ModuleGuard moduleId="flotte_carte"><FlotteLiveMapPage /></ModuleGuard>} />
        <Route path="flotte-carte"     element={<ModuleGuard moduleId="flotte_carte"><FlotteLiveMapPage /></ModuleGuard>} />
        <Route path="parc-vehicules"   element={<ModuleGuard moduleId="flotte_vehicules"><FlotteVehiculesPage /></ModuleGuard>} />
        <Route path="conducteurs"      element={<ModuleGuard moduleId="flotte_conducteurs"><FlotteConducteursPage /></ModuleGuard>} />
        <Route path="missions"         element={<ModuleGuard moduleId="flotte_missions"><FlotteMissionsPage /></ModuleGuard>} />
        <Route path="carburant"        element={<ModuleGuard moduleId="flotte_carburant"><FlotteCarburantPage /></ModuleGuard>} />
        <Route path="maintenance"      element={<SectorAwareMaintenance />} />
        <Route path="documents"        element={<ModuleGuard moduleId="flotte_documents"><SectorAwareDocuments /></ModuleGuard>} />
        <Route path="geofences"        element={<ModuleGuard moduleId="flotte_geofences"><FlotteGeofencesPage /></ModuleGuard>} />
        <Route path="capteurs"         element={<ModuleGuard moduleId="flotte_capteurs"><FlotteCapteursPage /></ModuleGuard>} />
        <Route path="inspections"      element={<ModuleGuard moduleId="flotte_inspections"><FlotteInspectionsPage /></ModuleGuard>} />
        <Route path="rapports-flotte"  element={<ModuleGuard moduleId="flotte_rapports"><FlotteRapportsPage /></ModuleGuard>} />
        <Route path="integrations-gps" element={<ModuleGuard moduleId="flotte_integrations"><FlotteIntegrationsGpsPage /></ModuleGuard>} />
        <Route path="parametres-gps"   element={<ModuleGuard moduleId="flotte_parametres"><FlotteParametresGpsPage /></ModuleGuard>} />
      </Route>

      {/* Rétrocompatibilité /dashboard */}
      <Route
        path="/dashboard"
        element={<ProtectedRoute><AppLayout /></ProtectedRoute>}
      >
        <Route index element={<Navigate to="/dashboard/tableau-bord" replace />} />
        <Route path="tableau-bord"   element={<ModuleGuard moduleId="dashboard"><SectorAwareDashboard /></ModuleGuard>} />
        <Route path="dashboard"      element={<ModuleGuard moduleId="dashboard"><SectorAwareDashboard /></ModuleGuard>} />
        <Route path="vente"          element={<ModuleGuard moduleId="ventes"><SectorAwareVentes /></ModuleGuard>} />
        <Route path="vente-pos"      element={<ModuleGuard moduleId="ventes"><SectorAwareVentes /></ModuleGuard>} />
        <Route path="vendeur"        element={<ModuleGuard moduleId="vendeur"><VendeurPage /></ModuleGuard>} />
        <Route path="prise-commande" element={<ModuleGuard moduleId="vendeur"><VendeurPage /></ModuleGuard>} />
        <Route path="bons-commande"  element={<ModuleGuard moduleId="vendeur"><VendeurPage /></ModuleGuard>} />
        <Route path="stocks"         element={<ModuleGuard moduleId="stock"><SectorAwareStocks /></ModuleGuard>} />
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

      {/* ═══════════════════════════════════════════════════════════════════
          GESTIO 229 ADMIN — ESPACE PRIVÉ DU SUPER ADMINISTRATEUR
          Totalement séparé des routes entreprises. Jamais accessible
          depuis l'espace normal des entreprises. Token JWT en sessionStorage.
          ═══════════════════════════════════════════════════════════════════ */}

      {/* Page de connexion Super Admin (non protégée) */}
      <Route path="/admin/login" element={<AdminLoginPage />} />

      {/* Routes protégées du Back-Office Super Admin */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
        }
      >
        {/* Redirection par défaut vers le dashboard */}
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard"    element={<AdminDashboard />} />
        <Route path="companies"    element={<AdminCompanies />} />
        <Route path="companies/:id" element={<AdminCompanyDetail />} />
        <Route path="subscriptions" element={<AdminSubscriptions />} />
        <Route path="finances"     element={<AdminFinances />} />
        <Route path="stats"        element={<AdminDashboard />} />
        <Route path="sectors"      element={<AdminSectors />} />
        <Route path="feedbacks"    element={<AdminFeedbacks />} />
        <Route path="audit"        element={<AdminAuditLog />} />
        <Route path="settings"     element={<AdminSettings />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

// ─── App Root ───────────────────────────────────────────────────────────────

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppInitializer />
        <CustomModalGestio />
        <PwaUpdateToast />
        <PwaInstallBanner />
        <SectorErrorBoundary>
          <Suspense fallback={<FullPageLoader />}>
            <AppRoutes />
          </Suspense>
        </SectorErrorBoundary>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
