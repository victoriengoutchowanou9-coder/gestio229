// =============================================================================
// GESTIO 229 SaaS — Carte GPS en Direct : Plein Écran & Supervision Flotte
// Suivi temps réel, tiroir télématique, filtre statut et simulateur d'itinéraires
// =============================================================================

import React, { useEffect, useState } from 'react'
import {
  Navigation,
  Search,
  Filter,
  Truck,
  Fuel,
  Gauge,
  User,
  Radio,
  Play,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  Clock,
  Compass,
  Battery,
  MapPin,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  getVehiculesFlotte,
  getGeofencesFlotte,
  simulerAvanceeVehicule,
  type FlotteVehicule,
  type FlotteGeofence,
} from '../../../services/flotteService'
import GoogleMapsView, { getStatusColor, getStatusLabel } from './GoogleMapsView'

export const FlotteLiveMapPage: React.FC = () => {
  const { company } = useTenant()
  const companyId = company?.id || ''

  const [vehicules, setVehicules] = useState<FlotteVehicule[]>([])
  const [geofences, setGeofences] = useState<FlotteGeofence[]>([])
  const [selectedVehicule, setSelectedVehicule] = useState<FlotteVehicule | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('TOUS')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [simulating, setSimulating] = useState<boolean>(false)

  const loadData = async () => {
    if (!companyId) return
    const [vList, gList] = await Promise.all([
      getVehiculesFlotte(companyId),
      getGeofencesFlotte(companyId),
    ])
    setVehicules(vList)
    setGeofences(gList)
    if (vList.length > 0 && !selectedVehicule) {
      setSelectedVehicule(vList[0])
    }
  }

  useEffect(() => {
    loadData()
  }, [companyId])

  // Filtrage
  const filteredVehicules = vehicules.filter((v) => {
    const matchesStatus = statusFilter === 'TOUS' || v.statut === statusFilter
    const q = searchQuery.toLowerCase().trim()
    const matchesSearch =
      !q ||
      v.immatriculation.toLowerCase().includes(q) ||
      v.marque.toLowerCase().includes(q) ||
      v.modele.toLowerCase().includes(q) ||
      (v.conducteur_nom && v.conducteur_nom.toLowerCase().includes(q))
    return matchesStatus && matchesSearch
  })

  // Simuler avancée
  const handleSimuler = async () => {
    if (!companyId || !selectedVehicule) return
    setSimulating(true)
    try {
      const updated = await simulerAvanceeVehicule(companyId, selectedVehicule.id, 0.7)
      if (updated) {
        setVehicules((prev) => prev.map((v) => (v.id === updated.id ? updated : v)))
        setSelectedVehicule(updated)
      }
    } finally {
      setSimulating(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] overflow-hidden bg-slate-900 text-white">
      {/* Barre d'outils supérieure */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-950 border-b border-slate-800 z-10">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-sky-600 flex items-center justify-center font-bold text-white shadow">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">Carte Flotte en Direct</h1>
            <p className="text-xs text-slate-400">
              {vehicules.length} véhicules supervisés à Cotonou et sur le réseau national
            </p>
          </div>
        </div>

        {/* Filtres & Recherche */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Recherche */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Immat, modèle, chauffeur..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 w-44 sm:w-56"
            />
          </div>

          {/* Filtre statut */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-sky-500"
          >
            <option value="TOUS">Tous les statuts ({vehicules.length})</option>
            <option value="EN_CIRCULATION">En circulation</option>
            <option value="A_L_ARRET">À l'arrêt</option>
            <option value="EN_MISSION">En mission</option>
            <option value="EN_MAINTENANCE">En maintenance</option>
            <option value="HORS_LIGNE">Hors ligne</option>
          </select>

          {/* Bouton Simulation GPS */}
          <button
            onClick={handleSimuler}
            disabled={simulating || !selectedVehicule}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow transition-all active:scale-95 disabled:opacity-50"
            title="Avance la position du véhicule sélectionné"
          >
            <Play className={`w-3.5 h-3.5 ${simulating ? 'animate-spin' : ''}`} />
            <span>Simuler GPS</span>
          </button>
        </div>
      </div>

      {/* Disposition principale : Panneau Liste Gauche + Carte + Tiroir Télématique Droite */}
      <div className="flex-1 relative flex overflow-hidden">
        {/* Liste Latérale des Véhicules (Rétractable sur mobile) */}
        <div className="w-72 sm:w-80 border-r border-slate-800 bg-slate-950/95 flex flex-col overflow-y-auto">
          <div className="p-3 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider flex justify-between items-center">
            <span>Véhicules ({filteredVehicules.length})</span>
            <span className="text-[10px] text-emerald-400 font-normal">Temps Réel</span>
          </div>

          <div className="divide-y divide-slate-800/60">
            {filteredVehicules.map((v) => {
              const isSelected = selectedVehicule?.id === v.id
              const color = getStatusColor(v.statut)

              return (
                <div
                  key={v.id}
                  onClick={() => setSelectedVehicule(v)}
                  className={`p-3.5 cursor-pointer transition-colors flex items-start justify-between gap-2.5 ${
                    isSelected ? 'bg-sky-950/60 border-l-4 border-sky-500' : 'hover:bg-slate-900/60'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-white tracking-tight">
                        {v.immatriculation}
                      </span>
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: color }}
                        title={getStatusLabel(v.statut)}
                      />
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {v.marque} {v.modele}
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" />
                      <span>{v.conducteur_nom || 'Non assigné'}</span>
                    </div>
                  </div>

                  <div className="text-right space-y-1">
                    <div className="font-bold text-xs text-emerald-400">
                      {v.derniere_vitesse} km/h
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {v.niveau_carburant_pct}% carb.
                    </div>
                  </div>
                </div>
              )
            })}

            {filteredVehicules.length === 0 && (
              <div className="p-8 text-center text-xs text-slate-500">
                Aucun véhicule ne correspond aux critères.
              </div>
            )}
          </div>
        </div>

        {/* Vue Carte Google Maps Plein Écran */}
        <div className="flex-1 h-full relative">
          <GoogleMapsView
            vehicules={filteredVehicules}
            selectedVehicule={selectedVehicule}
            onSelectVehicule={(v) => setSelectedVehicule(v)}
            geofences={geofences}
            height="100%"
          />
        </div>

        {/* Tiroir Télématique Droite (Véhicule Sélectionné) */}
        {selectedVehicule && (
          <div className="w-80 border-l border-slate-800 bg-slate-950/95 p-4 flex flex-col justify-between overflow-y-auto z-10 shadow-2xl">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <span className="text-[10px] font-semibold text-sky-400 uppercase tracking-widest">
                    Traceur Connecté
                  </span>
                  <h3 className="text-base font-bold text-white">
                    {selectedVehicule.immatriculation}
                  </h3>
                </div>
                <span
                  className="px-2 py-0.5 text-[11px] font-bold rounded-full text-white"
                  style={{ backgroundColor: getStatusColor(selectedVehicule.statut) }}
                >
                  {getStatusLabel(selectedVehicule.statut)}
                </span>
              </div>

              {/* Jauges instantanées */}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
                  <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
                    <Gauge className="w-3 h-3 text-emerald-400" />
                    <span>Vitesse</span>
                  </div>
                  <div className="text-xl font-bold text-emerald-400 mt-1">
                    {selectedVehicule.derniere_vitesse}{' '}
                    <span className="text-xs font-normal">km/h</span>
                  </div>
                </div>

                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
                  <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
                    <Fuel className="w-3 h-3 text-sky-400" />
                    <span>Carburant</span>
                  </div>
                  <div className="text-xl font-bold text-sky-400 mt-1">
                    {selectedVehicule.niveau_carburant_pct}{' '}
                    <span className="text-xs font-normal">%</span>
                  </div>
                </div>
              </div>

              {/* Informations télématiques détaillées */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Véhicule :</span>
                  <span className="font-semibold text-white">
                    {selectedVehicule.marque} {selectedVehicule.modele}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Chauffeur :</span>
                  <span className="font-semibold text-white">
                    {selectedVehicule.conducteur_nom || 'Non assigné'}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Contact / Moteur :</span>
                  <span
                    className={`font-semibold ${
                      selectedVehicule.contact_allume ? 'text-emerald-400' : 'text-slate-500'
                    }`}
                  >
                    {selectedVehicule.contact_allume ? 'Allumé (ON)' : 'Coupé (OFF)'}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Cap / Direction :</span>
                  <span className="font-mono text-white flex items-center gap-1">
                    <Compass className="w-3.5 h-3.5 text-sky-400" />
                    <span>{selectedVehicule.dernier_cap}°</span>
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Compteur Km :</span>
                  <span className="font-semibold text-white">
                    {selectedVehicule.kilometrage_actuel.toLocaleString()} km
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Balise IMEI :</span>
                  <span className="font-mono text-[11px] text-slate-300">
                    {selectedVehicule.tracker_imei || 'Non appareillé'}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Position GPS :</span>
                  <span className="font-mono text-[11px] text-sky-400">
                    {selectedVehicule.derniere_latitude?.toFixed(4)},{' '}
                    {selectedVehicule.derniere_longitude?.toFixed(4)}
                  </span>
                </div>

                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Dernier signal :</span>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>
                      {selectedVehicule.derniere_mise_a_jour_gps
                        ? new Date(selectedVehicule.derniere_mise_a_jour_gps).toLocaleTimeString()
                        : 'En direct'}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* Boutons d'action du tiroir */}
            <div className="space-y-2 pt-4 border-t border-slate-800">
              <button
                onClick={handleSimuler}
                disabled={simulating}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Simuler Déplacement</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <a
                  href="#/flotte-geolocalisation/missions"
                  className="py-1.5 text-center text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors"
                >
                  Mission
                </a>
                <a
                  href="#/flotte-geolocalisation/carburant"
                  className="py-1.5 text-center text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors"
                >
                  Carburant
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default FlotteLiveMapPage
