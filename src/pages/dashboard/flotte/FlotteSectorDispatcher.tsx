// =============================================================================
// GESTIO 229 SaaS — Dispatcher & Hub Métier : GÉOLOCALISATION ET FLOTTE (20ᵉ Activité)
// Barre de navigation horizontale unifiée pour les 15 modules de télématique
// =============================================================================

import React, { useState } from 'react'
import {
  Navigation,
  MapPin,
  Truck,
  UserCheck,
  Route,
  Fuel,
  Wrench,
  FileText,
  Shield,
  AlertTriangle,
  Thermometer,
  Calendar,
  ClipboardCheck,
  BarChart3,
  Radio,
  Settings,
  LayoutDashboard,
} from 'lucide-react'

// Modules
import FlotteDashboardPage from './FlotteDashboardPage'
import FlotteLiveMapPage from './FlotteLiveMapPage'
import FlotteVehiculesPage from './FlotteVehiculesPage'
import FlotteConducteursPage from './FlotteConducteursPage'
import FlotteMissionsPage from './FlotteMissionsPage'
import FlotteCarburantPage from './FlotteCarburantPage'
import FlotteMaintenancePage from './FlotteMaintenancePage'
import FlotteDocumentsPage from './FlotteDocumentsPage'
import FlotteGeofencesPage from './FlotteGeofencesPage'
import FlotteAlertesPage from './FlotteAlertesPage'
import FlotteCapteursPage from './FlotteCapteursPage'
import FlotteReservationsPage from './FlotteReservationsPage'
import FlotteInspectionsPage from './FlotteInspectionsPage'
import FlotteRapportsPage from './FlotteRapportsPage'
import FlotteIntegrationsGpsPage from './FlotteIntegrationsGpsPage'
import FlotteParametresGpsPage from './FlotteParametresGpsPage'

export type FlotteModuleTab =
  | 'dashboard'
  | 'carte'
  | 'vehicules'
  | 'conducteurs'
  | 'missions'
  | 'carburant'
  | 'maintenance'
  | 'documents'
  | 'geofences'
  | 'alertes'
  | 'capteurs'
  | 'reservations'
  | 'inspections'
  | 'rapports'
  | 'integrations'
  | 'parametres'

interface FlotteSectorDispatcherProps {
  initialTab?: FlotteModuleTab
}

export const FlotteSectorDispatcher: React.FC<FlotteSectorDispatcherProps> = ({
  initialTab = 'dashboard',
}) => {
  const [activeTab, setActiveTab] = useState<FlotteModuleTab>(initialTab)

  const TABS = [
    { id: 'dashboard' as FlotteModuleTab, label: 'Tableau de Bord', icon: LayoutDashboard },
    { id: 'carte' as FlotteModuleTab, label: 'Carte en Direct', icon: MapPin },
    { id: 'vehicules' as FlotteModuleTab, label: 'Parc Véhicules', icon: Truck },
    { id: 'conducteurs' as FlotteModuleTab, label: 'Conducteurs & Permis', icon: UserCheck },
    { id: 'missions' as FlotteModuleTab, label: 'Missions & Trajets', icon: Route },
    { id: 'carburant' as FlotteModuleTab, label: 'Carburant', icon: Fuel },
    { id: 'maintenance' as FlotteModuleTab, label: 'Entretien & Ateliers', icon: Wrench },
    { id: 'documents' as FlotteModuleTab, label: 'Assurances & Titres', icon: FileText },
    { id: 'geofences' as FlotteModuleTab, label: 'Zones Geofence', icon: Shield },
    { id: 'alertes' as FlotteModuleTab, label: 'Alertes GPS', icon: AlertTriangle },
    { id: 'capteurs' as FlotteModuleTab, label: 'Chaîne du Froid', icon: Thermometer },
    { id: 'reservations' as FlotteModuleTab, label: 'Autopartage', icon: Calendar },
    { id: 'inspections' as FlotteModuleTab, label: 'Inspections', icon: ClipboardCheck },
    { id: 'rapports' as FlotteModuleTab, label: 'Rapports & TCO', icon: BarChart3 },
    { id: 'integrations' as FlotteModuleTab, label: 'Traceurs Teltonika', icon: Radio },
    { id: 'parametres' as FlotteModuleTab, label: 'Paramètres GPS', icon: Settings },
  ]

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <FlotteDashboardPage />
      case 'carte':
        return <FlotteLiveMapPage />
      case 'vehicules':
        return <FlotteVehiculesPage />
      case 'conducteurs':
        return <FlotteConducteursPage />
      case 'missions':
        return <FlotteMissionsPage />
      case 'carburant':
        return <FlotteCarburantPage />
      case 'maintenance':
        return <FlotteMaintenancePage />
      case 'documents':
        return <FlotteDocumentsPage />
      case 'geofences':
        return <FlotteGeofencesPage />
      case 'alertes':
        return <FlotteAlertesPage />
      case 'capteurs':
        return <FlotteCapteursPage />
      case 'reservations':
        return <FlotteReservationsPage />
      case 'inspections':
        return <FlotteInspectionsPage />
      case 'rapports':
        return <FlotteRapportsPage />
      case 'integrations':
        return <FlotteIntegrationsGpsPage />
      case 'parametres':
        return <FlotteParametresGpsPage />
      default:
        return <FlotteDashboardPage />
    }
  }

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 flex flex-col">
      {/* Barre de navigation supérieure par onglets */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center space-x-2">
              <span className="text-base">🛰️</span>
              <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                GÉOLOCALISATION ET FLOTTE
              </span>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 rounded-full">
                20ᵉ Activité GESTIO 229
              </span>
            </div>

            <div className="flex items-center space-x-3 text-xs text-slate-500">
              <span className="flex items-center gap-1 text-emerald-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Ingestion Active</span>
              </span>
            </div>
          </div>

          {/* Onglets horizontaux à défilement fluide */}
          <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar py-2">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-sky-600 text-white shadow-sm font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Contenu de l'onglet actif */}
      <div className="flex-1">{renderContent()}</div>
    </div>
  )
}

export default FlotteSectorDispatcher
