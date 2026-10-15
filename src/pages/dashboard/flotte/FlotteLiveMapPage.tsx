// =============================================================================
// GESTIO 229 SaaS — Carte GPS Flotte en Direct : Supervision & Parcours Temps Réel
// Conforme à la Cartographie Google Maps Bénin (Axe Bohicon - Dassa - Cotonou)
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
  Trash2,
  PlusCircle,
  Route,
  Sparkles,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  getVehiculesFlotte,
  getGeofencesFlotte,
  getParcoursVehicule,
  simulerAvanceeVehicule,
  nettoyerValeursFictivesFlotte,
  creerVehiculeDemonstrationRnie2,
  PARCOURS_BENIN_RNIE2,
  type FlotteVehicule,
  type FlotteGeofence,
  type PointParcours,
} from '../../../services/flotteService'
import GoogleMapsView, { getStatusColor, getStatusLabel } from './GoogleMapsView'

export const FlotteLiveMapPage: React.FC = () => {
  const { company } = useTenant()
  const companyId = company?.id || ''

  const [vehicules, setVehicules] = useState<FlotteVehicule[]>([])
  const [geofences, setGeofences] = useState<FlotteGeofence[]>([])
  const [selectedVehicule, setSelectedVehicule] = useState<FlotteVehicule | null>(null)
  const [parcours, setParcours] = useState<PointParcours[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('TOUS')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [simulating, setSimulating] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [notification, setNotification] = useState<string | null>(null)

  // ─── 1. CHARGEMENT & NETTOYAGE DES DONNÉES FICTIVES ─────────────────────────
  const loadData = async (forceClean: boolean = false) => {
    if (!companyId) return
    setLoading(true)
    try {
      if (forceClean) {
        await nettoyerValeursFictivesFlotte(companyId)
      }

      const [vList, gList] = await Promise.all([
        getVehiculesFlotte(companyId),
        getGeofencesFlotte(companyId),
      ])

      setVehicules(vList)
      setGeofences(gList)

      if (vList.length > 0) {
        const current = selectedVehicule
          ? vList.find((v) => v.id === selectedVehicule.id) || vList[0]
          : vList[0]
        setSelectedVehicule(current)

        // Charger son parcours
        const pts = await getParcoursVehicule(companyId, current.id)
        setParcours(pts.length > 0 ? pts : PARCOURS_BENIN_RNIE2)
      } else {
        setSelectedVehicule(null)
        setParcours([])
      }
    } finally {
      setLoading(false)
    }
  }

  // Nettoyage automatique au premier montage
  useEffect(() => {
    loadData(true)
  }, [companyId])

  // Charger le parcours lors du changement de véhicule sélectionné
  useEffect(() => {
    if (!companyId || !selectedVehicule) return
    getParcoursVehicule(companyId, selectedVehicule.id).then((pts) => {
      setParcours(pts.length > 0 ? pts : PARCOURS_BENIN_RNIE2)
    })
  }, [companyId, selectedVehicule?.id])

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

  // Simuler avancée en direct sur la RNIE 2
  const handleSimuler = async () => {
    if (!companyId || !selectedVehicule) return
    setSimulating(true)
    try {
      const updated = await simulerAvanceeVehicule(companyId, selectedVehicule.id, 1.2)
      if (updated) {
        setVehicules((prev) => prev.map((v) => (v.id === updated.id ? updated : v)))
        setSelectedVehicule(updated)

        // Recharger le parcours mis à jour
        const pts = await getParcoursVehicule(companyId, updated.id)
        if (pts.length > 0) setParcours(pts)
      }
    } finally {
      setSimulating(false)
    }
  }

  // Nettoyer manuellement toutes les valeurs fictives
  const handleNettoyerValeursFictives = async () => {
    if (!companyId) return
    await nettoyerValeursFictivesFlotte(companyId)
    await loadData(false)
    setNotification('Toutes les valeurs et entités fictives ont été purgées avec succès.')
    setTimeout(() => setNotification(null), 4000)
  }

  // Créer un véhicule témoin sur la RNIE 2 (Bohicon - Dassa)
  const handleCreerVehiculeTest = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const testVeh = await creerVehiculeDemonstrationRnie2(companyId)
      await loadData(false)
      setSelectedVehicule(testVeh)
      setNotification(
        'Véhicule témoin activé sur la RNIE 2 (Bohicon - Dassa). Vous pouvez simuler son déplacement !'
      )
      setTimeout(() => setNotification(null), 5000)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] overflow-hidden bg-slate-900 text-white">
      {/* Toast de notification */}
      {notification && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[2000] px-4 py-2 bg-emerald-600 text-white rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-2 border border-emerald-400 animate-in fade-in slide-in-from-top-4">
          <CheckCircle className="w-4 h-4" />
          <span>{notification}</span>
        </div>
      )}

      {/* Barre d'outils supérieure */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-950 border-b border-slate-800 z-10">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-sky-600 flex items-center justify-center font-bold text-white shadow">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white leading-tight">Carte Flotte en Direct</h1>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                Google Maps Bénin
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {vehicules.length === 0
                ? 'Aucune donnée fictive active — En attente de véhicules réels'
                : `${vehicules.length} véhicule(s) supervisé(s) sur le réseau national (RNIE 2)`}
            </p>
          </div>
        </div>

        {/* Filtres & Actions */}
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
            title="Avance la position du véhicule sélectionné sur son parcours"
          >
            <Play className={`w-3.5 h-3.5 ${simulating ? 'animate-spin' : ''}`} />
            <span>Simuler GPS</span>
          </button>

          {/* Bouton Purge / Nettoyage valeurs fictives */}
          <button
            onClick={handleNettoyerValeursFictives}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-rose-900/60 hover:text-rose-200 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition-colors"
            title="Purger toutes les fausses valeurs résiduelles"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline">Nettoyer fictifs</span>
          </button>
        </div>
      </div>

      {/* Disposition principale : Panneau Liste Gauche + Carte + Tiroir Télématique Droite */}
      <div className="flex-1 relative flex overflow-hidden">
        {/* Liste Latérale des Véhicules */}
        <div className="w-72 sm:w-80 border-r border-slate-800 bg-slate-950/95 flex flex-col overflow-y-auto">
          <div className="p-3 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider flex justify-between items-center">
            <span>Véhicules ({filteredVehicules.length})</span>
            <span className="text-[10px] text-emerald-400 font-normal">Temps Réel</span>
          </div>

          <div className="divide-y divide-slate-800/60 flex-1">
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

            {/* État vide propre : 0 valeur fictive */}
            {filteredVehicules.length === 0 && (
              <div className="p-6 text-center text-xs text-slate-400 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
                  <Truck className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">Flotte nettoyée</h4>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    Toutes les fausses valeurs ont été supprimées. Aucun véhicule fictif n'est affiché.
                  </p>
                </div>

                <div className="pt-2 space-y-2">
                  <a
                    href="#/flotte-geolocalisation/vehicules"
                    className="w-full py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors shadow"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Ajouter un vrai véhicule</span>
                  </a>

                  <button
                    onClick={handleCreerVehiculeTest}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 border border-slate-700 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Tester sur RNIE 2 (Bohicon - Dassa)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Vue Carte Google Maps Fidèle (Plein Écran) */}
        <div className="flex-1 h-full relative">
          <GoogleMapsView
            vehicules={filteredVehicules}
            selectedVehicule={selectedVehicule}
            onSelectVehicule={(v) => setSelectedVehicule(v)}
            geofences={geofences}
            parcours={parcours}
            height="100%"
            centerLat={7.1783}
            centerLng={2.0667}
            zoom={9}
          />
        </div>

        {/* Tiroir Télématique Droite (Véhicule Sélectionné) */}
        {selectedVehicule && (
          <div className="w-80 border-l border-slate-800 bg-slate-950/95 p-4 flex flex-col justify-between overflow-y-auto z-10 shadow-2xl">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <span className="text-[10px] font-semibold text-sky-400 uppercase tracking-widest flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
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
                  <span className="text-slate-400">Contact moteur :</span>
                  <span
                    className={`font-semibold ${
                      selectedVehicule.contact_allume ? 'text-emerald-400' : 'text-slate-500'
                    }`}
                  >
                    {selectedVehicule.contact_allume ? '🟢 Allumé (ON)' : '🔴 Coupé (OFF)'}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Cap / Direction :</span>
                  <span className="font-mono text-white flex items-center gap-1">
                    <Compass className="w-3.5 h-3.5 text-sky-400" />
                    <span>{selectedVehicule.dernier_cap}° (Axe Nord RNIE 2)</span>
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Compteur Km :</span>
                  <span className="font-semibold text-white">
                    {selectedVehicule.kilometrage_actuel.toLocaleString()} km
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Position GPS :</span>
                  <span className="font-mono text-[11px] text-sky-400 font-semibold">
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

              {/* Résumé du parcours */}
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5">
                <div className="text-[11px] font-bold text-sky-400 flex items-center gap-1.5">
                  <Route className="w-3.5 h-3.5" />
                  <span>Son Parcours (Bénin RNIE 2)</span>
                </div>
                <div className="text-[10px] text-slate-400 leading-relaxed">
                  Départ de <strong>Cotonou</strong> ➔ passage par <strong>Allada & Bohicon</strong> (actuel){' '}
                  ➔ destination <strong>Dassa-Zoumè</strong>.
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
                <span>Simuler Avancée sur le Parcours</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <a
                  href="#/flotte-geolocalisation/missions"
                  className="py-1.5 text-center text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors"
                >
                  Missions
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
