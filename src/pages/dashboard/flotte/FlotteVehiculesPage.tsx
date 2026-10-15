// =============================================================================
// GESTIO 229 SaaS — Parc Véhicules : Gestion Intégrale de la Flotte
// CRUD complet, assignation conducteurs, association traceurs GPS & compteurs km
// =============================================================================

import React, { useEffect, useState } from 'react'
import {
  Truck,
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Navigation,
  Fuel,
  User,
  Radio,
  CheckCircle2,
  AlertTriangle,
  X,
  Save,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  getVehiculesFlotte,
  saveVehiculeFlotte,
  deleteVehiculeFlotte,
  getConducteursFlotte,
  type FlotteVehicule,
  type FlotteConducteur,
  type FlotteStatutVehicule,
  type FlotteTypeVehicule,
  type FlotteTypeCarburant,
} from '../../../services/flotteService'
import { getStatusColor, getStatusLabel } from './GoogleMapsView'

export const FlotteVehiculesPage: React.FC = () => {
  const { company } = useTenant()
  const companyId = company?.id || ''

  const [vehicules, setVehicules] = useState<FlotteVehicule[]>([])
  const [conducteurs, setConducteurs] = useState<FlotteConducteur[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [search, setSearch] = useState<string>('')
  const [filterType, setFilterType] = useState<string>('TOUS')
  const [filterStatut, setFilterStatut] = useState<string>('TOUS')

  // Modal
  const [modalOpen, setModalOpen] = useState<boolean>(false)
  const [editingVehicule, setEditingVehicule] = useState<Partial<FlotteVehicule> | null>(null)
  const [saving, setSaving] = useState<boolean>(false)

  const loadData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [vList, cList] = await Promise.all([
        getVehiculesFlotte(companyId),
        getConducteursFlotte(companyId),
      ])
      setVehicules(vList)
      setConducteurs(cList)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [companyId])

  const filtered = vehicules.filter((v) => {
    const q = search.toLowerCase().trim()
    const matchSearch =
      !q ||
      v.immatriculation.toLowerCase().includes(q) ||
      v.marque.toLowerCase().includes(q) ||
      v.modele.toLowerCase().includes(q) ||
      (v.conducteur_nom && v.conducteur_nom.toLowerCase().includes(q))
    const matchType = filterType === 'TOUS' || v.type_vehicule === filterType
    const matchStatut = filterStatut === 'TOUS' || v.statut === filterStatut
    return matchSearch && matchType && matchStatut
  })

  const handleOpenAdd = () => {
    setEditingVehicule({
      immatriculation: '',
      code_interne: `FL-0${vehicules.length + 1}`,
      marque: '',
      modele: '',
      annee: new Date().getFullYear(),
      type_vehicule: 'VOITURE',
      type_carburant: 'GASOIL',
      capacite_reservoir_litres: 60,
      consommation_reference_100km: 8.5,
      kilometrage_actuel: 0,
      statut: 'DISPONIBLE',
      niveau_carburant_pct: 100,
    })
    setModalOpen(true)
  }

  const handleOpenEdit = (v: FlotteVehicule) => {
    setEditingVehicule({ ...v })
    setModalOpen(true)
  }

  const handleDelete = async (id: string, immat: string) => {
    if (!window.confirm(`Confirmez-vous la suppression du véhicule ${immat} de la flotte ?`)) return
    await deleteVehiculeFlotte(companyId, id)
    setVehicules((prev) => prev.filter((v) => v.id !== id))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingVehicule?.immatriculation || !editingVehicule?.marque) return
    setSaving(true)
    try {
      // Trouver le nom du chauffeur si ID fourni
      let driverName = editingVehicule.conducteur_nom
      if (editingVehicule.conducteur_assigne_id) {
        const found = conducteurs.find((c) => c.id === editingVehicule.conducteur_assigne_id)
        if (found) driverName = found.nom_complet
      }

      const saved = await saveVehiculeFlotte(companyId, {
        ...editingVehicule,
        conducteur_nom: driverName,
      })

      setVehicules((prev) => {
        const idx = prev.findIndex((v) => v.id === saved.id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = saved
          return next
        }
        return [saved, ...prev]
      })
      setModalOpen(false)
      setEditingVehicule(null)
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
            <Truck className="w-6 h-6 text-sky-600" />
            <span>Parc des Véhicules & Équipements</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Inventaire des véhicules de l'entreprise, caractéristiques, conducteurs et balises GPS
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center space-x-1.5 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold shadow transition-colors active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Nouveau Véhicule</span>
        </button>
      </div>

      {/* Barre de Recherche et Filtres */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Rechercher immatriculation, marque, chauffeur..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-sky-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          >
            <option value="TOUS">Tous types ({vehicules.length})</option>
            <option value="VOITURE">Voiture</option>
            <option value="UTILITAIRE">Utilitaire</option>
            <option value="CAMION">Camion</option>
            <option value="MOTO">Moto</option>
            <option value="FRIGORIFIQUE">Frigorifique</option>
            <option value="ENGIN_BTP">Engin BTP</option>
          </select>

          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          >
            <option value="TOUS">Tous les statuts</option>
            <option value="DISPONIBLE">Disponible</option>
            <option value="EN_CIRCULATION">En circulation</option>
            <option value="A_L_ARRET">À l'arrêt</option>
            <option value="EN_MISSION">En mission</option>
            <option value="EN_MAINTENANCE">En maintenance</option>
            <option value="HORS_LIGNE">Hors ligne</option>
          </select>
        </div>
      </div>

      {/* Tableau du Parc */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-semibold">
                <th className="py-3 px-4">Immatriculation</th>
                <th className="py-3 px-4">Véhicule</th>
                <th className="py-3 px-4">Type & Énergie</th>
                <th className="py-3 px-4">Conducteur Habituel</th>
                <th className="py-3 px-4">Compteur (Km)</th>
                <th className="py-3 px-4">Traceur GPS</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-slate-700 dark:text-slate-300">
              {filtered.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getStatusColor(v.statut) }} />
                    <span>{v.immatriculation}</span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {v.marque} {v.modele}
                    </div>
                    <div className="text-[10px] text-slate-500">{v.annee || '—'}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                      {v.type_vehicule}
                    </span>
                    <span className="ml-1 text-[10px] text-slate-500">{v.type_carburant}</span>
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                    {v.conducteur_nom || <span className="text-slate-400 italic">Non assigné</span>}
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                    {v.kilometrage_actuel.toLocaleString()} km
                  </td>
                  <td className="py-3 px-4">
                    {v.tracker_imei ? (
                      <span className="font-mono text-[11px] text-sky-600 dark:text-sky-400 flex items-center gap-1">
                        <Radio className="w-3 h-3 text-emerald-500" />
                        <span>{v.tracker_imei}</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">Aucun</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-full text-white"
                      style={{ backgroundColor: getStatusColor(v.statut) }}
                    >
                      {getStatusLabel(v.statut)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end space-x-1">
                      <button
                        onClick={() => handleOpenEdit(v)}
                        className="p-1.5 text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Modifier"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(v.id, v.immatriculation)}
                        className="p-1.5 text-slate-500 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/30"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Aucun véhicule enregistré ou trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Ajout / Modification Véhicule */}
      {modalOpen && editingVehicule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Truck className="w-5 h-5 text-sky-600" />
                <span>
                  {editingVehicule.id ? 'Modifier Véhicule' : 'Enregistrer Nouveau Véhicule'}
                </span>
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Numéro d'Immatriculation *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: AY 8940 RB"
                    value={editingVehicule.immatriculation || ''}
                    onChange={(e) =>
                      setEditingVehicule({ ...editingVehicule, immatriculation: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl uppercase font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Code Interne Flotte
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: FL-01"
                    value={editingVehicule.code_interne || ''}
                    onChange={(e) =>
                      setEditingVehicule({ ...editingVehicule, code_interne: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Marque *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Toyota, Renault, Scania..."
                    value={editingVehicule.marque || ''}
                    onChange={(e) =>
                      setEditingVehicule({ ...editingVehicule, marque: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Modèle *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Hilux, Trafic, Actros..."
                    value={editingVehicule.modele || ''}
                    onChange={(e) =>
                      setEditingVehicule({ ...editingVehicule, modele: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Type de Véhicule
                  </label>
                  <select
                    value={editingVehicule.type_vehicule || 'VOITURE'}
                    onChange={(e) =>
                      setEditingVehicule({
                        ...editingVehicule,
                        type_vehicule: e.target.value as FlotteTypeVehicule,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                  >
                    <option value="VOITURE">Voiture Légère / Berline</option>
                    <option value="UTILITAIRE">Utilitaire / Fourgon</option>
                    <option value="CAMION">Camion Porteur / Poids Lourd</option>
                    <option value="MOTO">Moto de Course / Express</option>
                    <option value="BUS">Bus / Transport Personnel</option>
                    <option value="FRIGORIFIQUE">Camion Frigorifique</option>
                    <option value="ENGIN_BTP">Engin Chantier / Benne</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Type de Carburant
                  </label>
                  <select
                    value={editingVehicule.type_carburant || 'GASOIL'}
                    onChange={(e) =>
                      setEditingVehicule({
                        ...editingVehicule,
                        type_carburant: e.target.value as FlotteTypeCarburant,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                  >
                    <option value="GASOIL">Gasoil / Diesel</option>
                    <option value="ESSENCE">Essence / Super</option>
                    <option value="HYBRIDE">Hybride</option>
                    <option value="ELECTRIQUE">Électrique</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Compteur Kilométrique (Km)
                  </label>
                  <input
                    type="number"
                    value={editingVehicule.kilometrage_actuel ?? 0}
                    onChange={(e) =>
                      setEditingVehicule({
                        ...editingVehicule,
                        kilometrage_actuel: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Capacité Réservoir (Litres)
                  </label>
                  <input
                    type="number"
                    value={editingVehicule.capacite_reservoir_litres ?? 60}
                    onChange={(e) =>
                      setEditingVehicule({
                        ...editingVehicule,
                        capacite_reservoir_litres: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Conducteur Assigné
                  </label>
                  <select
                    value={editingVehicule.conducteur_assigne_id || ''}
                    onChange={(e) =>
                      setEditingVehicule({
                        ...editingVehicule,
                        conducteur_assigne_id: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                  >
                    <option value="">-- Aucun chauffeur assigné --</option>
                    {conducteurs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom_complet} (Permis {c.categories_permis})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Traceur GPS (Numéro IMEI)
                  </label>
                  <input
                    type="text"
                    placeholder="862904041289401"
                    value={editingVehicule.tracker_imei || ''}
                    onChange={(e) =>
                      setEditingVehicule({ ...editingVehicule, tracker_imei: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Statut Actuel
                  </label>
                  <select
                    value={editingVehicule.statut || 'DISPONIBLE'}
                    onChange={(e) =>
                      setEditingVehicule({
                        ...editingVehicule,
                        statut: e.target.value as FlotteStatutVehicule,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                  >
                    <option value="DISPONIBLE">Disponible</option>
                    <option value="EN_CIRCULATION">En circulation</option>
                    <option value="A_L_ARRET">À l'arrêt</option>
                    <option value="EN_MISSION">En mission</option>
                    <option value="EN_MAINTENANCE">En maintenance</option>
                    <option value="HORS_LIGNE">Hors ligne</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Numéro de Châssis (VIN)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: VF1BB0A0..."
                    value={editingVehicule.vin || ''}
                    onChange={(e) =>
                      setEditingVehicule({ ...editingVehicule, vin: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono uppercase"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-semibold flex items-center gap-1.5 shadow"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Enregistrement...' : 'Enregistrer le véhicule'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default FlotteVehiculesPage
