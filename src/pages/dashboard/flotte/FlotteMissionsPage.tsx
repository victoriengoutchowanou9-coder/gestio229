// =============================================================================
// GESTIO 229 SaaS — Missions & Ordres de Dispatch Flotte
// Suivi des tournées, kilomètres départ/arrivée, marchandises & bordereaux
// =============================================================================

import React, { useEffect, useState } from 'react'
import {
  Navigation,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Play,
  MapPin,
  Truck,
  User,
  X,
  Save,
  Check,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  getMissionsFlotte,
  saveMissionFlotte,
  getVehiculesFlotte,
  getConducteursFlotte,
  type FlotteMission,
  type FlotteVehicule,
  type FlotteConducteur,
} from '../../../services/flotteService'

export const FlotteMissionsPage: React.FC = () => {
  const { company } = useTenant()
  const companyId = company?.id || ''

  const [missions, setMissions] = useState<FlotteMission[]>([])
  const [vehicules, setVehicules] = useState<FlotteVehicule[]>([])
  const [conducteurs, setConducteurs] = useState<FlotteConducteur[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [search, setSearch] = useState<string>('')
  const [modalOpen, setModalOpen] = useState<boolean>(false)
  const [editingMission, setEditingMission] = useState<Partial<FlotteMission>>({})
  const [saving, setSaving] = useState<boolean>(false)

  const loadData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [mList, vList, cList] = await Promise.all([
        getMissionsFlotte(companyId),
        getVehiculesFlotte(companyId),
        getConducteursFlotte(companyId),
      ])
      setMissions(mList)
      setVehicules(vList)
      setConducteurs(cList)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [companyId])

  const filtered = missions.filter((m) => {
    const q = search.toLowerCase().trim()
    return (
      !q ||
      m.titre_mission.toLowerCase().includes(q) ||
      m.numero_ordre.toLowerCase().includes(q) ||
      (m.vehicule_immat && m.vehicule_immat.toLowerCase().includes(q)) ||
      (m.conducteur_nom && m.conducteur_nom.toLowerCase().includes(q))
    )
  })

  const handleOpenAdd = () => {
    const defaultV = vehicules[0]
    setEditingMission({
      numero_ordre: `MSN-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      titre_mission: '',
      vehicule_id: defaultV?.id || '',
      vehicule_immat: defaultV?.immatriculation || '',
      conducteur_nom: defaultV?.conducteur_nom || '',
      depart_lieu: 'Cotonou - Siège Principal',
      destination_lieu: '',
      date_depart_prevue: new Date().toISOString(),
      statut: 'PLANIFIEE',
      kilometrage_depart: defaultV?.kilometrage_actuel || 0,
    })
    setModalOpen(true)
  }

  const handleStartMission = async (m: FlotteMission) => {
    const updated = await saveMissionFlotte(companyId, {
      ...m,
      statut: 'EN_COURS',
      date_depart_reelle: new Date().toISOString(),
    })
    setMissions((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
  }

  const handleFinishMission = async (m: FlotteMission) => {
    const kmFin = prompt('Entrez le kilométrage au retour (compteur) :', String((m.kilometrage_depart || 0) + 45))
    if (!kmFin) return
    const kmArriveeNum = Number(kmFin)
    const dist = Math.max(0, kmArriveeNum - (m.kilometrage_depart || 0))

    const updated = await saveMissionFlotte(companyId, {
      ...m,
      statut: 'TERMINEE',
      date_arrivee_reelle: new Date().toISOString(),
      kilometrage_arrivee: kmArriveeNum,
      distance_parcourue_km: dist,
    })
    setMissions((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingMission.titre_mission || !editingMission.destination_lieu) return
    setSaving(true)
    try {
      const saved = await saveMissionFlotte(companyId, editingMission)
      setMissions((prev) => [saved, ...prev.filter((m) => m.id !== saved.id)])
      setModalOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Navigation className="w-6 h-6 text-sky-600" />
            <span>Missions, Tournées & Ordres de Route</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Dispatch des véhicules, suivi des départs/retours et kilométrages réalisés
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center space-x-1.5 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold shadow transition-colors active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle Mission</span>
        </button>
      </div>

      {/* Barre recherche */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Rechercher mission, n° ordre, destination, chauffeur..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {/* Liste des Missions */}
      <div className="space-y-3">
        {filtered.map((m) => (
          <div
            key={m.id}
            className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-sky-600 dark:text-sky-400">
                  {m.numero_ordre}
                </span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                    m.statut === 'EN_COURS'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                      : m.statut === 'TERMINEE'
                      ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {m.statut}
                </span>
              </div>

              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                {m.titre_mission}
              </h3>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-1 text-slate-800 dark:text-slate-200 font-medium">
                  <Truck className="w-3.5 h-3.5 text-slate-400" />
                  <span>{m.vehicule_immat || 'Véhicule'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>{m.conducteur_nom || 'Chauffeur'}</span>
                </div>
                <div className="flex items-center gap-1 text-sky-600">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>
                    {m.depart_lieu} ➔ {m.destination_lieu}
                  </span>
                </div>
                {m.distance_parcourue_km && (
                  <div className="font-bold text-emerald-600">
                    {m.distance_parcourue_km} km réalisés
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {m.statut === 'PLANIFIEE' && (
                <button
                  onClick={() => handleStartMission(m)}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Démarrer</span>
                </button>
              )}

              {m.statut === 'EN_COURS' && (
                <button
                  onClick={() => handleFinishMission(m)}
                  className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Clôturer Mission</span>
                </button>
              )}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-xs bg-white dark:bg-slate-900 rounded-2xl border">
            Aucune mission trouvée.
          </div>
        )}
      </div>

      {/* Modal Ajout Mission */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border p-5 max-w-lg w-full space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Créer un Ordre de Mission
              </h2>
              <button onClick={() => setModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block font-semibold mb-1">Intitulé de la Mission *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Livraison surgelés Calavi & Porto-Novo"
                  value={editingMission.titre_mission || ''}
                  onChange={(e) =>
                    setEditingMission({ ...editingMission, titre_mission: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Véhicule Flotte *</label>
                  <select
                    value={editingMission.vehicule_immat || ''}
                    onChange={(e) => {
                      const sel = vehicules.find((v) => v.immatriculation === e.target.value)
                      setEditingMission({
                        ...editingMission,
                        vehicule_id: sel?.id,
                        vehicule_immat: sel?.immatriculation,
                        conducteur_nom: sel?.conducteur_nom,
                        kilometrage_depart: sel?.kilometrage_actuel,
                      })
                    }}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  >
                    {vehicules.map((v) => (
                      <option key={v.id} value={v.immatriculation}>
                        {v.immatriculation} ({v.marque})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Chauffeur</label>
                  <input
                    type="text"
                    value={editingMission.conducteur_nom || ''}
                    onChange={(e) =>
                      setEditingMission({ ...editingMission, conducteur_nom: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Point de Départ</label>
                  <input
                    type="text"
                    value={editingMission.depart_lieu || 'Cotonou'}
                    onChange={(e) =>
                      setEditingMission({ ...editingMission, depart_lieu: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Destination *</label>
                  <input
                    type="text"
                    required
                    placeholder="Abomey-Calavi / Parakou"
                    value={editingMission.destination_lieu || ''}
                    onChange={(e) =>
                      setEditingMission({ ...editingMission, destination_lieu: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Marchandises / Description</label>
                <textarea
                  rows={2}
                  placeholder="Colis, caisses, documents confidentiels..."
                  value={editingMission.description_chargement || ''}
                  onChange={(e) =>
                    setEditingMission({
                      ...editingMission,
                      description_chargement: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-sky-600 text-white rounded-xl font-bold flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>Créer l'Ordre</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default FlotteMissionsPage
