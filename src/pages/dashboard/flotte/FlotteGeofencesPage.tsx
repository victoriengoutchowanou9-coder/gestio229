// =============================================================================
// GESTIO 229 SaaS — Zones Géographiques & Geofencing Flotte
// Définition de zones de sécurité (Dépôt, Port, Chantiers), détection entrée/sortie
// =============================================================================

import React, { useEffect, useState } from 'react'
import {
  Shield,
  Plus,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  X,
  Save,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  getGeofencesFlotte,
  saveGeofenceFlotte,
  type FlotteGeofence,
} from '../../../services/flotteService'

export const FlotteGeofencesPage: React.FC = () => {
  const { company } = useTenant()
  const companyId = company?.id || ''

  const [geofences, setGeofences] = useState<FlotteGeofence[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [modalOpen, setModalOpen] = useState<boolean>(false)
  const [editingGeo, setEditingGeo] = useState<Partial<FlotteGeofence>>({})
  const [saving, setSaving] = useState<boolean>(false)

  const loadData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const list = await getGeofencesFlotte(companyId)
      setGeofences(list)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [companyId])

  const handleOpenAdd = () => {
    setEditingGeo({
      nom_zone: '',
      type_zone: 'CERCLE',
      type_usage: 'DEPOT',
      centre_lat: 6.3654,
      centre_lng: 2.4285,
      rayon_metres: 500,
      couleur_hex: '#0284c7',
      alerter_sur_entree: true,
      alerter_sur_sortie: true,
      actif: true,
    })
    setModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingGeo.nom_zone) return
    setSaving(true)
    try {
      const saved = await saveGeofenceFlotte(companyId, editingGeo)
      setGeofences((prev) => [saved, ...prev.filter((g) => g.id !== saved.id)])
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
            <Shield className="w-6 h-6 text-sky-600" />
            <span>Zones Géographiques & Geofencing</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Périmètres virtuels de sécurité : détection automatique des entrées et sorties de zone
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center space-x-1.5 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold shadow transition-colors active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle Zone</span>
        </button>
      </div>

      {/* Grille des Geofences */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {geofences.map((g) => (
          <div
            key={g.id}
            className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2.5">
                <span
                  className="w-3.5 h-3.5 rounded-full border border-white shadow"
                  style={{ backgroundColor: g.couleur_hex }}
                />
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  {g.nom_zone}
                </h3>
              </div>

              <span
                className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                  g.actif ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {g.actif ? 'Actif' : 'Inactif'}
              </span>
            </div>

            <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Type de Zone :</span>
                <span className="font-semibold">{g.type_usage}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Rayon :</span>
                <span className="font-semibold">{g.rayon_metres} mètres</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Centre GPS :</span>
                <span className="font-mono text-[11px] text-sky-600">
                  {g.centre_lat?.toFixed(4)}, {g.centre_lng?.toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Règles d'Alerte :</span>
                <span className="font-medium text-emerald-600">
                  {g.alerter_sur_entree && 'Entrée '}{g.alerter_sur_sortie && 'Sortie'}
                </span>
              </div>
            </div>
          </div>
        ))}

        {geofences.length === 0 && (
          <div className="col-span-3 p-12 text-center text-slate-400 text-xs bg-white dark:bg-slate-900 rounded-2xl border">
            Aucune zone géographique configurée.
          </div>
        )}
      </div>

      {/* Modal Ajout Zone */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border p-5 max-w-md w-full space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Définir une Zone Géographique
              </h2>
              <button onClick={() => setModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block font-semibold mb-1">Nom de la Zone *</label>
                <input
                  type="text"
                  required
                  placeholder="Dépôt Ganhi, Terminal Portuaire, Zone Calavi..."
                  value={editingGeo.nom_zone || ''}
                  onChange={(e) => setEditingGeo({ ...editingGeo, nom_zone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Type d'Usage</label>
                  <select
                    value={editingGeo.type_usage || 'DEPOT'}
                    onChange={(e) => setEditingGeo({ ...editingGeo, type_usage: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  >
                    <option value="DEPOT">Dépôt / Entrepôt Siège</option>
                    <option value="PORT">Zone Portuaire</option>
                    <option value="ZONE_LIVRAISON">Zone de Livraison</option>
                    <option value="ZONE_INTERDITE">Zone Interdite</option>
                    <option value="CHANTIER">Chantier BTP</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1">Rayon (mètres)</label>
                  <input
                    type="number"
                    value={editingGeo.rayon_metres || 500}
                    onChange={(e) =>
                      setEditingGeo({ ...editingGeo, rayon_metres: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Latitude Centre</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={editingGeo.centre_lat || 6.3654}
                    onChange={(e) =>
                      setEditingGeo({ ...editingGeo, centre_lat: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Longitude Centre</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={editingGeo.centre_lng || 2.4285}
                    onChange={(e) =>
                      setEditingGeo({ ...editingGeo, centre_lng: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Couleur d'Affichage</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={editingGeo.couleur_hex || '#0284c7'}
                    onChange={(e) => setEditingGeo({ ...editingGeo, couleur_hex: e.target.value })}
                    className="w-8 h-8 rounded-lg cursor-pointer border"
                  />
                  <span className="font-mono text-slate-500">{editingGeo.couleur_hex}</span>
                </div>
              </div>

              <div className="space-y-1.5 pt-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingGeo.alerter_sur_entree ?? true}
                    onChange={(e) =>
                      setEditingGeo({ ...editingGeo, alerter_sur_entree: e.target.checked })
                    }
                    className="rounded text-sky-600"
                  />
                  <span>Alerter immédiatement lors de l'entrée d'un véhicule</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingGeo.alerter_sur_sortie ?? true}
                    onChange={(e) =>
                      setEditingGeo({ ...editingGeo, alerter_sur_sortie: e.target.checked })
                    }
                    className="rounded text-sky-600"
                  />
                  <span>Alerter immédiatement lors de la sortie d'un véhicule</span>
                </label>
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
                  <span>Enregistrer la Zone</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default FlotteGeofencesPage
