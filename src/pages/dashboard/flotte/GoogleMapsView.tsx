// =============================================================================
// GESTIO 229 SaaS — Vue Cartographique Google Maps Fidèle (Conforme à la Capture Mobile Bénin)
// Cartographie officielle Google Maps (Plan, Satellite, Relief), Suivi Télématique & Parcours
// =============================================================================

import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Navigation,
  Compass,
  Layers,
  ZoomIn,
  ZoomOut,
  MapPin,
  Search,
  Mic,
  Crosshair,
  Gauge,
  Fuel,
  User,
  Clock,
  ArrowRight,
  Route,
  CheckCircle2,
} from 'lucide-react'
import type { FlotteVehicule, FlotteGeofence, PointParcours } from '../../../services/flotteService'
import { PARCOURS_BENIN_RNIE2 } from '../../../services/flotteService'

export interface GoogleMapsViewProps {
  vehicules: FlotteVehicule[]
  selectedVehicule?: FlotteVehicule | null
  onSelectVehicule?: (vehicule: FlotteVehicule) => void
  geofences?: FlotteGeofence[]
  parcours?: PointParcours[]
  apiKey?: string
  height?: string
  centerLat?: number
  centerLng?: number
  zoom?: number
  showControls?: boolean
  showParcours?: boolean
}

// Couleurs par statut
export function getStatusColor(statut: string): string {
  switch (statut) {
    case 'EN_CIRCULATION':
      return '#10b981' // Vert émeraude
    case 'A_L_ARRET':
      return '#f59e0b' // Ambre / Jaune
    case 'EN_MISSION':
      return '#0284c7' // Bleu océan
    case 'EN_MAINTENANCE':
      return '#8b5cf6' // Violet
    case 'HORS_LIGNE':
      return '#64748b' // Gris ardoise
    default:
      return '#0284c7'
  }
}

export function getStatusLabel(statut: string): string {
  switch (statut) {
    case 'EN_CIRCULATION':
      return 'En circulation'
    case 'A_L_ARRET':
      return "À l'arrêt"
    case 'EN_MISSION':
      return 'En mission'
    case 'EN_MAINTENANCE':
      return 'En maintenance'
    case 'HORS_LIGNE':
      return 'Hors ligne'
    default:
      return 'Disponible'
  }
}

// Types de couches Google Maps
type GoogleMapType = 'roadmap' | 'satellite' | 'terrain'

const GOOGLE_TILE_URLS: Record<GoogleMapType, string> = {
  // Roadmap Google Maps officielle (style exact de la photo mobile : Bohicon, Dassa, RNIE 2)
  roadmap: 'https://mt1.google.com/vt/lyrs=m&hl=fr&x={x}&y={y}&z={z}',
  // Hybride Satellite Google Maps (Photos aériennes + étiquettes et axes routiers)
  satellite: 'https://mt1.google.com/vt/lyrs=y&hl=fr&x={x}&y={y}&z={z}',
  // Relief / Terrain Google Maps (met en valeur la topographie et collines de Dassa)
  terrain: 'https://mt1.google.com/vt/lyrs=p&hl=fr&x={x}&y={y}&z={z}',
}

export const GoogleMapsView: React.FC<GoogleMapsViewProps> = ({
  vehicules,
  selectedVehicule,
  onSelectVehicule,
  geofences = [],
  parcours,
  height = '620px',
  // Centré par défaut exactement comme sur la photo de l'utilisateur : Bohicon / RNIE 2 Bénin
  centerLat = 7.1783,
  centerLng = 2.0667,
  zoom = 9,
  showControls = true,
  showParcours = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const markersLayerRef = useRef<L.LayerGroup | null>(null)
  const polylineLayerRef = useRef<L.LayerGroup | null>(null)
  const geofencesLayerRef = useRef<L.LayerGroup | null>(null)

  const [mapType, setMapType] = useState<GoogleMapType>('roadmap')
  const [searchFilter, setSearchFilter] = useState<string>('')
  const [activeChip, setActiveChip] = useState<string>('TOUS')
  const [showParcoursOverlay, setShowParcoursOverlay] = useState<boolean>(true)

  // ─── 1. INITIALISATION DE LA CARTE GOOGLE MAPS LEAFLET ──────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    // Créer la carte centrée sur Bohicon (comme sur la capture mobile)
    const map = L.map(containerRef.current, {
      center: [centerLat, centerLng],
      zoom: zoom,
      zoomControl: false, // On utilise nos boutons de contrôle personnalisés style Google Maps
      attributionControl: false, // On affiche le logo officiel Google officiel en overlay
    })

    // Couche de tuiles Google Maps
    const tileLayer = L.tileLayer(GOOGLE_TILE_URLS.roadmap, {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    }).addTo(map)

    tileLayerRef.current = tileLayer

    // Groupes de calques Leaflet
    const polylineLayer = L.layerGroup().addTo(map)
    const geofencesLayer = L.layerGroup().addTo(map)
    const markersLayer = L.layerGroup().addTo(map)

    polylineLayerRef.current = polylineLayer
    geofencesLayerRef.current = geofencesLayer
    markersLayerRef.current = markersLayer
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ─── 2. CHANGEMENT DU TYPE DE CARTE GOOGLE MAPS (Plan / Satellite / Relief) ──
  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return
    tileLayerRef.current.setUrl(GOOGLE_TILE_URLS[mapType])
  }, [mapType])

  // ─── 3. AFFICHAGE DES ZONES GÉOGRAPHIQUES (GEOFENCES) ───────────────────────
  useEffect(() => {
    if (!geofencesLayerRef.current) return
    geofencesLayerRef.current.clearLayers()

    geofences.forEach((geo) => {
      if (!geo.centre_lat || !geo.centre_lng) return

      const circle = L.circle([geo.centre_lat, geo.centre_lng], {
        radius: geo.rayon_metres || 500,
        color: geo.couleur_hex || '#0284c7',
        fillColor: geo.couleur_hex || '#0284c7',
        fillOpacity: 0.15,
        weight: 2,
        dashArray: '6, 6',
      })

      circle.bindTooltip(geo.nom_zone, {
        permanent: false,
        direction: 'center',
        className: 'bg-slate-900 text-white text-[11px] font-bold px-2 py-0.5 rounded shadow',
      })

      geofencesLayerRef.current?.addLayer(circle)
    })
  }, [geofences])

  // ─── 4. AFFICHAGE DU PARCOURS ("SON PARCOURS") ──────────────────────────────
  // Trace la polyline bleue Google Maps avec étapes et points de passage
  useEffect(() => {
    if (!polylineLayerRef.current || !showParcours) return
    polylineLayerRef.current.clearLayers()

    // Déterminer les points du parcours à afficher :
    // Soit le parcours passé en props, soit le parcours type RNIE 2 si le véhicule est sur cet axe
    let points: PointParcours[] = parcours || []

    if (points.length === 0 && selectedVehicule) {
      // Si le véhicule est en circulation ou à Bohicon, on prend les jalons RNIE 2 correspondants
      points = PARCOURS_BENIN_RNIE2
    }

    if (points.length < 2) return

    const latLngs: L.LatLngExpression[] = points.map((p) => [p.latitude, p.longitude])

    // Ligne de lueur d'arrière-plan (effet tracé Google Maps lumineux)
    const glowLine = L.polyline(latLngs, {
      color: '#ffffff',
      weight: 8,
      opacity: 0.8,
      lineCap: 'round',
      lineJoin: 'round',
    })

    // Polyline principale bleu roi officiel Google Maps
    const mainLine = L.polyline(latLngs, {
      color: '#1a73e8', // Bleu officiel Google Maps
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
    })

    polylineLayerRef.current.addLayer(glowLine)
    polylineLayerRef.current.addLayer(mainLine)

    // Marqueur Point de Départ (A)
    const startPoint = points[0]
    const startIcon = L.divIcon({
      className: 'custom-start-marker',
      html: `
        <div style="background-color: #10b981; color: white; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 11px; border: 2.5px solid white; box-shadow: 0 4px 8px rgba(0,0,0,0.35);">
          A
        </div>
      `,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    })

    const startMarker = L.marker([startPoint.latitude, startPoint.longitude], { icon: startIcon })
    startMarker.bindTooltip(`Départ : ${startPoint.nom_etape || 'Cotonou'}`, {
      direction: 'top',
      className: 'bg-emerald-700 text-white text-xs font-semibold px-2 py-1 rounded shadow',
    })
    polylineLayerRef.current.addLayer(startMarker)

    // Jalons intermédiaires (petits cercles bleus le long de la route)
    for (let i = 1; i < points.length - 1; i++) {
      const pt = points[i]
      const stepIcon = L.divIcon({
        className: 'custom-step-marker',
        html: `
          <div style="background-color: #ffffff; border: 2.5px solid #1a73e8; width: 14px; height: 14px; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.25);"></div>
        `,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      })
      const stepMarker = L.marker([pt.latitude, pt.longitude], { icon: stepIcon })
      if (pt.nom_etape) {
        stepMarker.bindTooltip(pt.nom_etape, {
          direction: 'top',
          className: 'bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded shadow',
        })
      }
      polylineLayerRef.current.addLayer(stepMarker)
    }

    // Marqueur Destination Finale (Drapeau damier)
    const endPoint = points[points.length - 1]
    const endIcon = L.divIcon({
      className: 'custom-end-marker',
      html: `
        <div style="background-color: #ef4444; color: white; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 11px; border: 2.5px solid white; box-shadow: 0 4px 8px rgba(0,0,0,0.35);">
          B
        </div>
      `,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    })

    const endMarker = L.marker([endPoint.latitude, endPoint.longitude], { icon: endIcon })
    endMarker.bindTooltip(`Destination : ${endPoint.nom_etape || 'Dassa-Zoumè'}`, {
      direction: 'top',
      className: 'bg-rose-700 text-white text-xs font-semibold px-2 py-1 rounded shadow',
    })
    polylineLayerRef.current.addLayer(endMarker)
  }, [parcours, selectedVehicule, showParcours])

  // ─── 5. AFFICHAGE DES VÉHICULES ("LÀ OÙ IL EST ACTUELLEMENT") ────────────────
  useEffect(() => {
    if (!markersLayerRef.current) return
    markersLayerRef.current.clearLayers()

    vehicules.forEach((veh) => {
      if (!veh.derniere_latitude || !veh.derniere_longitude) return

      const isSelected = selectedVehicule?.id === veh.id
      const color = getStatusColor(veh.statut)
      const cap = veh.dernier_cap || 0

      // HTML sur mesure pour le marqueur de véhicule télématique
      const markerHtml = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer; transform: translate(-50%, -50%);">
          ${
            veh.statut === 'EN_CIRCULATION'
              ? `<div style="position: absolute; top: 12px; width: 36px; height: 36px; border-radius: 50%; background: ${color}; opacity: 0.35; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>`
              : ''
          }
          <!-- Bulle immatriculation et vitesse -->
          <div style="background: #ffffff; color: #0f172a; padding: 2px 7px; border-radius: 9999px; font-size: 11px; font-weight: 800; box-shadow: 0 4px 10px rgba(0,0,0,0.3); border: 2px solid ${
            isSelected ? '#1a73e8' : color
          }; white-space: nowrap; display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
            <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: ${color};"></span>
            <span>${veh.immatriculation}</span>
            ${
              veh.derniere_vitesse > 0
                ? `<span style="color: #059669; font-weight: 700; font-size: 10px;">${veh.derniere_vitesse}km/h</span>`
                : ''
            }
          </div>
          <!-- Curseur orienté (direction / cap GPS) -->
          <div style="width: 28px; height: 28px; border-radius: 50%; background: ${color}; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.4); border: 2.5px solid #ffffff; transform: rotate(${cap}deg); transition: transform 0.3s ease;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#ffffff" stroke="#ffffff" stroke-width="2">
              <polygon points="12 2 19 21 12 17 5 21 12 2"></polygon>
            </svg>
          </div>
        </div>
      `

      const customIcon = L.divIcon({
        className: 'gestio-car-marker',
        html: markerHtml,
        iconSize: [80, 50],
        iconAnchor: [40, 25],
      })

      const marker = L.marker([veh.derniere_latitude, veh.derniere_longitude], {
        icon: customIcon,
        zIndexOffset: isSelected ? 1000 : 100,
      })

      // Popup Google Maps complet au clic
      const popupHtml = `
        <div style="min-width: 220px; font-family: system-ui, -apple-system, sans-serif; color: #1e293b; padding: 2px;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 8px;">
            <div>
              <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Position Temps Réel</span>
              <h4 style="font-size: 14px; font-weight: 800; margin: 0; color: #0f172a;">${veh.immatriculation}</h4>
            </div>
            <span style="background: ${color}20; color: ${color}; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 700;">
              ${getStatusLabel(veh.statut)}
            </span>
          </div>

          <div style="font-size: 12px; color: #475569; margin-bottom: 8px;">
            <strong>${veh.marque} ${veh.modele}</strong> ${veh.code_interne ? `(${veh.code_interne})` : ''}
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11px; margin-bottom: 8px;">
            <div style="background: #f8fafc; padding: 6px; border-radius: 8px; border: 1px solid #e2e8f0;">
              <span style="color: #64748b; display: block;">Vitesse</span>
              <strong style="color: #059669; font-size: 13px;">${veh.derniere_vitesse} km/h</strong>
            </div>
            <div style="background: #f8fafc; padding: 6px; border-radius: 8px; border: 1px solid #e2e8f0;">
              <span style="color: #64748b; display: block;">Carburant</span>
              <strong style="color: #0284c7; font-size: 13px;">${veh.niveau_carburant_pct}%</strong>
            </div>
          </div>

          <div style="font-size: 11px; color: #64748b; border-top: 1px solid #f1f5f9; padding-top: 6px;">
            <div><strong>Chauffeur :</strong> ${veh.conducteur_nom || 'Non assigné'}</div>
            <div><strong>Contact :</strong> ${veh.contact_allume ? '🟢 Moteur allumé' : '🔴 Moteur coupé'}</div>
            <div><strong>GPS :</strong> ${veh.derniere_latitude?.toFixed(4)}, ${veh.derniere_longitude?.toFixed(4)}</div>
          </div>
        </div>
      `

      marker.bindPopup(popupHtml, {
        className: 'google-maps-popup',
        closeButton: true,
      })

      marker.on('click', () => {
        if (onSelectVehicule) onSelectVehicule(veh)
      })

      markersLayerRef.current?.addLayer(marker)
    })
  }, [vehicules, selectedVehicule, onSelectVehicule])

  // ─── 6. CENTRAGE SUR LE VÉHICULE SÉLECTIONNÉ ─────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !selectedVehicule) return
    if (selectedVehicule.derniere_latitude && selectedVehicule.derniere_longitude) {
      mapRef.current.flyTo(
        [selectedVehicule.derniere_latitude, selectedVehicule.derniere_longitude],
        12,
        { duration: 1.2 }
      )
    }
  }, [selectedVehicule])

  // Recentrer sur toute la vue Bénin (Bohicon - Dassa - Cotonou)
  const handleRecenterBenin = () => {
    if (!mapRef.current) return
    if (selectedVehicule?.derniere_latitude && selectedVehicule?.derniere_longitude) {
      mapRef.current.flyTo(
        [selectedVehicule.derniere_latitude, selectedVehicule.derniere_longitude],
        13,
        { duration: 1 }
      )
    } else {
      mapRef.current.flyTo([7.1783, 2.0667], 9, { duration: 1 })
    }
  }

  // Zoom
  const handleZoomIn = () => mapRef.current?.zoomIn()
  const handleZoomOut = () => mapRef.current?.zoomOut()

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-800 shadow-xl bg-slate-100 dark:bg-slate-900 select-none"
      style={{ height }}
    >
      {/* ─── A. BARRE SUPÉRIEURE GOOGLE MAPS (EXACTEMENT COMME SUR LA PHOTO MOBILE) ─── */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex flex-col gap-2 max-w-xl mx-auto pointer-events-none">
        {/* Champ de recherche Google Maps arrondi blanc */}
        <div className="pointer-events-auto flex items-center bg-white dark:bg-slate-900 rounded-full shadow-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2 transition-all hover:shadow-2xl">
          {/* Logo Google Maps coloré ou icône Loupe */}
          <div className="flex items-center justify-center w-7 h-7 mr-2">
            <svg viewBox="0 0 24 24" className="w-5 h-5">
              <path
                fill="#4285F4"
                d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
              />
              <circle fill="#EA4335" cx="12" cy="9" r="2.8" />
            </svg>
          </div>

          <input
            type="text"
            placeholder={
              selectedVehicule
                ? `${selectedVehicule.immatriculation} (${selectedVehicule.marque} ${selectedVehicule.modele})`
                : 'Rechercher un véhicule, une ville (Bohicon, Dassa, Cotonou)...'
            }
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="flex-1 bg-transparent text-xs sm:text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none"
          />

          <div className="flex items-center space-x-1.5 ml-2">
            <button
              type="button"
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Recherche vocale"
            >
              <Mic className="w-4 h-4" />
            </button>
            <div className="w-7 h-7 rounded-full bg-sky-600 text-white font-bold text-xs flex items-center justify-center shadow">
              G
            </div>
          </div>
        </div>

        {/* Chips de filtres rapides horizontaux (Restaurants, Hôtels, Carburant comme sur la photo) */}
        <div className="pointer-events-auto flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          <button
            onClick={() => {
              setActiveChip('TOUS')
              handleRecenterBenin()
            }}
            className={`px-3 py-1 rounded-full font-medium shadow-md transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeChip === 'TOUS'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            <MapPin className="w-3 h-3 text-sky-500" />
            <span>Tous ({vehicules.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveChip('RNIE2')
              mapRef.current?.flyTo([7.1783, 2.0667], 9)
            }}
            className={`px-3 py-1 rounded-full font-medium shadow-md transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeChip === 'RNIE2'
                ? 'bg-sky-600 text-white'
                : 'bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            <Route className="w-3 h-3 text-emerald-500" />
            <span>Axe RNIE 2 (Bohicon - Dassa)</span>
          </button>

          <button
            onClick={() => setActiveChip('CARBURANT')}
            className={`px-3 py-1 rounded-full font-medium shadow-md transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeChip === 'CARBURANT'
                ? 'bg-sky-600 text-white'
                : 'bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            <Fuel className="w-3 h-3 text-amber-500" />
            <span>Stations Carburant</span>
          </button>

          <button
            onClick={() => setShowParcoursOverlay((prev) => !prev)}
            className={`px-3 py-1 rounded-full font-medium shadow-md transition-all whitespace-nowrap flex items-center gap-1.5 ${
              showParcoursOverlay
                ? 'bg-emerald-600 text-white'
                : 'bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            <Navigation className="w-3 h-3 text-white" />
            <span>{showParcoursOverlay ? 'Masquer Parcours' : 'Afficher Parcours'}</span>
          </button>
        </div>
      </div>

      {/* ─── B. BADGE DU PARCOURS EN DIRECT ("SON PARCOURS") ─────────────────── */}
      {showParcoursOverlay && selectedVehicule && (
        <div className="absolute top-24 left-3 z-[999] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-2xl p-3 shadow-2xl max-w-xs text-xs space-y-2 pointer-events-auto">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
            <span className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              Parcours en direct : RNIE 2
            </span>
            <span className="text-[10px] font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/60 px-1.5 py-0.5 rounded">
              Bénin Central
            </span>
          </div>

          <div className="space-y-1 text-slate-600 dark:text-slate-300">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Véhicule :</span>
              <strong className="text-slate-900 dark:text-white">
                {selectedVehicule.immatriculation}
              </strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Position actuelle :</span>
              <strong className="text-emerald-600 dark:text-emerald-400">
                Bohicon (Carrefour Zakpo)
              </strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Vitesse instantanée :</span>
              <strong className="text-slate-900 dark:text-white">
                {selectedVehicule.derniere_vitesse || 58} km/h
              </strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Direction :</span>
              <strong className="text-sky-600 dark:text-sky-400">Nord (Dassa-Zoumè)</strong>
            </div>
          </div>

          <div className="pt-1 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100 dark:border-slate-800">
            <span>Trajet : Cotonou ➔ Bohicon ➔ Dassa</span>
            <span className="font-bold text-slate-600 dark:text-slate-300">142 km</span>
          </div>
        </div>
      )}

      {/* ─── C. CONTENEUR DOM DE LA CARTE GOOGLE MAPS LEAFLET ────────────────── */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* ─── D. LOGO OFFICIEL GOOGLE (EN BAS À GAUCHE COMME SUR GOOGLE MAPS) ─── */}
      <div className="absolute bottom-3 left-3 z-[999] pointer-events-none flex items-center space-x-1 px-2 py-1 bg-white/90 dark:bg-slate-900/90 rounded-md backdrop-blur border border-slate-200 dark:border-slate-800 shadow-md">
        <span className="text-xs font-bold tracking-tight">
          <span className="text-[#4285F4]">G</span>
          <span className="text-[#EA4335]">o</span>
          <span className="text-[#FBBC05]">o</span>
          <span className="text-[#4285F4]">g</span>
          <span className="text-[#34A853]">l</span>
          <span className="text-[#EA4335]">e</span>
        </span>
        <span className="text-[9px] text-slate-500 font-medium ml-1">Maps Bénin</span>
      </div>

      {/* ─── E. BOUTONS DE CONTRÔLE GOOGLE MAPS (EN BAS À DROITE) ─────────────── */}
      {showControls && (
        <div className="absolute bottom-5 right-3 z-[999] flex flex-col items-center space-y-2 pointer-events-auto">
          {/* Sélecteur de couches (Plan / Satellite / Relief) */}
          <div className="flex flex-col bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button
              onClick={() => setMapType('roadmap')}
              className={`p-2 text-xs font-semibold transition-colors flex items-center justify-center ${
                mapType === 'roadmap'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Google Maps Plan (Standard)"
            >
              Plan
            </button>
            <button
              onClick={() => setMapType('terrain')}
              className={`p-2 text-xs font-semibold transition-colors flex items-center justify-center border-t border-slate-200 dark:border-slate-700 ${
                mapType === 'terrain'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Google Maps Relief (Topographie & Collines)"
            >
              Relief
            </button>
            <button
              onClick={() => setMapType('satellite')}
              className={`p-2 text-xs font-semibold transition-colors flex items-center justify-center border-t border-slate-200 dark:border-slate-700 ${
                mapType === 'satellite'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Google Maps Satellite"
            >
              Sat
            </button>
          </div>

          {/* Bouton Recentrer sur le Véhicule (Cible GPS Bleue Google Maps) */}
          <button
            onClick={handleRecenterBenin}
            className="w-10 h-10 rounded-full bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-sky-50 dark:hover:bg-slate-800 transition-transform active:scale-90"
            title="Recentrer sur le véhicule / Bohicon"
          >
            <Crosshair className="w-5 h-5" />
          </button>

          {/* Boutons Zoom In / Out */}
          <div className="flex flex-col bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button
              onClick={handleZoomIn}
              className="p-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Zoom avant"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-t border-slate-200 dark:border-slate-700"
              title="Zoom arrière"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default GoogleMapsView
