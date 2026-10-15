// =============================================================================
// GESTIO 229 SaaS — Tableau de Bord Principal : GÉOLOCALISATION ET FLOTTE
// Vue Télématique en Direct, Indicateurs KPIs, Mini-Carte et Alertes
// =============================================================================

import React, { useEffect, useState } from 'react'
import {
  Truck,
  Navigation,
  AlertTriangle,
  Fuel,
  Wrench,
  UserCheck,
  ShieldAlert,
  Play,
  Plus,
  RefreshCw,
  ExternalLink,
  MapPin,
  Calendar,
  FileText,
  Activity,
  CheckCircle2,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  getVehiculesFlotte,
  getAlertesFlotte,
  getMaintenanceFlotte,
  getCarburantLogs,
  getMissionsFlotte,
  getDocumentsFlotte,
  getGeofencesFlotte,
  simulerAvanceeVehicule,
  type FlotteVehicule,
  type FlotteAlerte,
  type FlotteMaintenance,
  type FlotteCarburant,
  type FlotteDocument,
} from '../../../services/flotteService'
import GoogleMapsView, { getStatusColor, getStatusLabel } from './GoogleMapsView'

export const FlotteDashboardPage: React.FC = () => {
  const { company } = useTenant()
  const companyId = company?.id || ''

  const [vehicules, setVehicules] = useState<FlotteVehicule[]>([])
  const [alertes, setAlertes] = useState<FlotteAlerte[]>([])
  const [maintenance, setMaintenance] = useState<FlotteMaintenance[]>([])
  const [carburant, setCarburant] = useState<FlotteCarburant[]>([])
  const [documents, setDocuments] = useState<FlotteDocument[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [simulating, setSimulating] = useState<boolean>(false)
  const [selectedVehicule, setSelectedVehicule] = useState<FlotteVehicule | null>(null)

  const loadData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [vList, aList, mList, cList, dList] = await Promise.all([
        getVehiculesFlotte(companyId),
        getAlertesFlotte(companyId),
        getMaintenanceFlotte(companyId),
        getCarburantLogs(companyId),
        getDocumentsFlotte(companyId),
      ])
      setVehicules(vList)
      setAlertes(aList)
      setMaintenance(mList)
      setCarburant(cList)
      setDocuments(dList)
      if (vList.length > 0 && !selectedVehicule) {
        setSelectedVehicule(vList[0])
      }
    } catch (err) {
      console.error('[FlotteDashboard] Erreur chargement:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [companyId])

  // KPIs Télématiques
  const totalVehicules = vehicules.length
  const enCirculation = vehicules.filter((v) => v.statut === 'EN_CIRCULATION').length
  const aLArret = vehicules.filter((v) => v.statut === 'A_L_ARRET').length
  const enMission = vehicules.filter((v) => v.statut === 'EN_MISSION').length
  const enMaintenance = vehicules.filter((v) => v.statut === 'EN_MAINTENANCE').length
  const horsLigne = vehicules.filter((v) => v.statut === 'HORS_LIGNE').length
  const alertesActives = alertes.filter((a) => !a.est_acquittee).length

  // Dépenses carburant du mois
  const totalCarburantMois = carburant.reduce((sum, c) => sum + (c.montant_total_fcfa || 0), 0)

  // Simulation en direct
  const handleSimulerMouvement = async () => {
    if (!companyId || vehicules.length === 0) return
    setSimulating(true)
    try {
      // Choisir un véhicule actif ou le 1er
      const target = selectedVehicule || vehicules[0]
      const updated = await simulerAvanceeVehicule(companyId, target.id, 0.8)
      if (updated) {
        setVehicules((prev) => prev.map((v) => (v.id === updated.id ? updated : v)))
        setSelectedVehicule(updated)
      }
      // Recharger alertes au cas où un excès de vitesse s'est produit
      const freshAlerts = await getAlertesFlotte(companyId)
      setAlertes(freshAlerts)
    } finally {
      setSimulating(false)
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header avec Actions Rapides */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 text-white flex items-center justify-center shadow-md shadow-sky-500/20">
            <Navigation className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span>Supervision Flotte & GPS</span>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
                20ᵉ Activité
              </span>
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Cartographie en direct, gestion du parc, télématique carburant & sécurité
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSimulerMouvement}
            disabled={simulating}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-60"
            title="Avance la position GPS du véhicule sélectionné pour tester la télématique"
          >
            <Play className={`w-3.5 h-3.5 ${simulating ? 'animate-spin' : ''}`} />
            <span>{simulating ? 'Simulation...' : 'Simuler Avancée GPS'}</span>
          </button>

          <button
            onClick={loadData}
            className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors border border-slate-200 dark:border-slate-800"
            title="Rafraîchir les données"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <a
            href="#/flotte-geolocalisation/carte"
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Plein Écran Carte</span>
          </a>
        </div>
      </div>

      {/* Cartes KPI Télématiques */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Flotte</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {totalVehicules}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <Truck className="w-3 h-3 text-sky-500" />
            <span>Véhicules déclarés</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">En Mouvement</div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {enCirculation}
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
            <Activity className="w-3 h-3" />
            <span>En circulation</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">À l'Arrêt</div>
          <div className="text-2xl font-bold text-amber-500 mt-1">{aLArret}</div>
          <div className="text-[11px] text-amber-500 mt-1 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Moteur coupé / ralenti</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">En Mission</div>
          <div className="text-2xl font-bold text-sky-600 dark:text-sky-400 mt-1">{enMission}</div>
          <div className="text-[11px] text-sky-500 mt-1 flex items-center gap-1">
            <Navigation className="w-3 h-3" />
            <span>Tournées actives</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">En Maintenance</div>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
            {enMaintenance}
          </div>
          <div className="text-[11px] text-purple-500 mt-1 flex items-center gap-1">
            <Wrench className="w-3 h-3" />
            <span>Atelier / Garage</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Alertes GPS</div>
          <div
            className={`text-2xl font-bold mt-1 ${
              alertesActives > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'
            }`}
          >
            {alertesActives}
          </div>
          <div className="text-[11px] text-rose-500 mt-1 flex items-center gap-1">
            <ShieldAlert className="w-3 h-3" />
            <span>Non acquittées</span>
          </div>
        </div>
      </div>

      {/* Section Principale : Carte en Direct & Détail Télématique Véhicule */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne Gauche (2 cols) : Carte Google Maps */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-sky-500" />
              <span>Cartographie en Temps Réel (Bénin)</span>
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Cliquez sur un marqueur pour inspecter la balise
            </span>
          </div>

          <GoogleMapsView
            vehicules={vehicules}
            selectedVehicule={selectedVehicule}
            onSelectVehicule={(v) => setSelectedVehicule(v)}
            height="460px"
          />
        </div>

        {/* Colonne Droite (1 col) : Panneau Télématique du véhicule sélectionné */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                  Télématique Véhicule
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {selectedVehicule?.immatriculation || 'Sélectionnez un véhicule'}
                </h3>
              </div>
              {selectedVehicule && (
                <span
                  className="px-2.5 py-1 text-xs font-semibold rounded-full text-white"
                  style={{ backgroundColor: getStatusColor(selectedVehicule.statut) }}
                >
                  {getStatusLabel(selectedVehicule.statut)}
                </span>
              )}
            </div>

            {selectedVehicule ? (
              <div className="mt-4 space-y-3.5 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800/60">
                  <span className="text-slate-500">Marque & Modèle :</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {selectedVehicule.marque} {selectedVehicule.modele} ({selectedVehicule.annee})
                  </span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800/60">
                  <span className="text-slate-500">Conducteur habituel :</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {selectedVehicule.conducteur_nom || 'Non assigné'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800/60">
                  <span className="text-slate-500">Vitesse instantanée :</span>
                  <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400">
                    {selectedVehicule.derniere_vitesse} km/h
                  </span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800/60">
                  <span className="text-slate-500">Contact / Moteur :</span>
                  <span
                    className={`font-semibold ${
                      selectedVehicule.contact_allume ? 'text-emerald-600' : 'text-slate-500'
                    }`}
                  >
                    {selectedVehicule.contact_allume ? 'Allumé (Ignition ON)' : 'Coupé (OFF)'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800/60">
                  <span className="text-slate-500">Niveau Carburant :</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-16 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sky-500 rounded-full"
                        style={{ width: `${selectedVehicule.niveau_carburant_pct}%` }}
                      />
                    </div>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {selectedVehicule.niveau_carburant_pct}%
                    </span>
                  </div>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800/60">
                  <span className="text-slate-500">Kilométrage Odomètre :</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {selectedVehicule.kilometrage_actuel.toLocaleString()} km
                  </span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800/60">
                  <span className="text-slate-500">Balise Traceur IMEI :</span>
                  <span className="font-mono text-slate-600 dark:text-slate-300">
                    {selectedVehicule.tracker_imei || 'Non appareillé'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500">Coordonnées GPS :</span>
                  <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                    {selectedVehicule.derniere_latitude?.toFixed(4)},{' '}
                    {selectedVehicule.derniere_longitude?.toFixed(4)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-8 text-center">
                Aucun véhicule n'est sélectionné.
              </p>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex gap-2">
            <a
              href="#/flotte-geolocalisation/missions"
              className="flex-1 py-2 text-center text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl transition-colors"
            >
              Créer Mission
            </a>
            <a
              href="#/flotte-geolocalisation/carburant"
              className="flex-1 py-2 text-center text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-xl transition-colors shadow-sm"
            >
              Enregistrer Plein
            </a>
          </div>
        </div>
      </div>

      {/* Grille Inférieure : Alertes Récentes & Prochaines Maintenances */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alertes Télématiques Récentes */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              <span>Incidents & Alertes Sécurité</span>
            </h3>
            <a
              href="#/flotte-geolocalisation/alertes"
              className="text-xs font-medium text-sky-600 hover:underline"
            >
              Voir tout ({alertes.length})
            </a>
          </div>

          <div className="space-y-2.5">
            {alertes.slice(0, 4).map((alt) => (
              <div
                key={alt.id}
                className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                  alt.gravite === 'CRITIQUE'
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-900 dark:text-rose-200'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200'
                }`}
              >
                <div>
                  <div className="font-bold flex items-center gap-2">
                    <span>{alt.vehicule_immat || 'Véhicule'}</span>
                    <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-white/60 dark:bg-black/30">
                      {alt.type_alerte}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-700 dark:text-slate-300">{alt.message}</p>
                </div>
                <span className="text-[10px] opacity-70 whitespace-nowrap">
                  {new Date(alt.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}

            {alertes.length === 0 && (
              <p className="text-xs text-slate-500 py-6 text-center">
                Aucune alerte récente. La flotte circule en toute sécurité.
              </p>
            )}
          </div>
        </div>

        {/* Prochains Entretiens & Expirations Documents */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Wrench className="w-4 h-4 text-amber-500" />
              <span>Carnet d'Entretien & Conformité</span>
            </h3>
            <a
              href="#/flotte-geolocalisation/maintenance"
              className="text-xs font-medium text-sky-600 hover:underline"
            >
              Planifier entretien
            </a>
          </div>

          <div className="space-y-3">
            {maintenance.slice(0, 3).map((m) => (
              <div
                key={m.id}
                className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>{m.vehicule_immat}</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 rounded font-normal">
                      {m.type_intervention}
                    </span>
                  </div>
                  <p className="text-slate-500 mt-0.5 line-clamp-1">{m.description}</p>
                </div>
                <div className="text-right">
                  <div className="font-bold text-slate-900 dark:text-white">
                    {m.cout_total_fcfa.toLocaleString()} FCFA
                  </div>
                  <span
                    className={`text-[10px] font-semibold ${
                      m.statut === 'TERMINE'
                        ? 'text-emerald-500'
                        : m.statut === 'EN_COURS'
                        ? 'text-amber-500'
                        : 'text-sky-500'
                    }`}
                  >
                    {m.statut}
                  </span>
                </div>
              </div>
            ))}

            {/* Alerte documents */}
            {documents.some((d) => d.statut_alerte === 'EXPIRATION_IMMINENTE') && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between text-xs text-amber-800 dark:text-amber-300">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-600" />
                  <span>Assurance ou Visite Technique à renouveler prochainement</span>
                </div>
                <a
                  href="#/flotte-geolocalisation/documents"
                  className="font-bold underline text-[11px]"
                >
                  Voir
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default FlotteDashboardPage
