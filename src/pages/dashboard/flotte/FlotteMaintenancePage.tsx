// =============================================================================
// GESTIO 229 SaaS — Maintenance, Entretien & Ateliers Flotte
// Vidanges, pneumatiques, freins, rappels kilométriques et ordres de réparation
// =============================================================================

import React, { useEffect, useState } from 'react'
import {
  Wrench,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calendar,
  Truck,
  DollarSign,
  X,
  Save,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  getMaintenanceFlotte,
  saveMaintenanceFlotte,
  getVehiculesFlotte,
  type FlotteMaintenance,
  type FlotteVehicule,
} from '../../../services/flotteService'

export const FlotteMaintenancePage: React.FC = () => {
  const { company } = useTenant()
  const companyId = company?.id || ''

  const [maintenances, setMaintenances] = useState<FlotteMaintenance[]>([])
  const [vehicules, setVehicules] = useState<FlotteVehicule[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [modalOpen, setModalOpen] = useState<boolean>(false)
  const [editingMaint, setEditingMaint] = useState<Partial<FlotteMaintenance>>({})
  const [saving, setSaving] = useState<boolean>(false)

  const loadData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [mList, vList] = await Promise.all([
        getMaintenanceFlotte(companyId),
        getVehiculesFlotte(companyId),
      ])
      setMaintenances(mList)
      setVehicules(vList)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [companyId])

  const handleOpenAdd = () => {
    const v = vehicules[0]
    setEditingMaint({
      vehicule_id: v?.id || '',
      vehicule_immat: v?.immatriculation || '',
      type_intervention: 'VIDANGE_HUILE',
      description: 'Vidange complète + changement filtre à huile et filtre à air',
      kilometrage_declenchement: v?.kilometrage_actuel || 0,
      prochain_kilometrage_prevu: (v?.kilometrage_actuel || 0) + 10000,
      date_intervention: new Date().toISOString().slice(0, 10),
      cout_pieces_fcfa: 45000,
      cout_main_oeuvre_fcfa: 15000,
      cout_total_fcfa: 60000,
      garage_prestataire: 'CFAO Motors Cotonou',
      statut: 'TERMINE',
    })
    setModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingMaint.vehicule_immat || !editingMaint.description) return
    setSaving(true)
    try {
      const saved = await saveMaintenanceFlotte(companyId, {
        ...editingMaint,
        cout_total_fcfa:
          (Number(editingMaint.cout_pieces_fcfa) || 0) +
          (Number(editingMaint.cout_main_oeuvre_fcfa) || 0),
      })
      setMaintenances((prev) => [saved, ...prev.filter((m) => m.id !== saved.id)])
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
            <Wrench className="w-6 h-6 text-sky-600" />
            <span>Entretien Préventif & Maintenance Ateliers</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Carnet de santé des véhicules, échéances de vidange, pneus, freins et coûts de réparation
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center space-x-1.5 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold shadow transition-colors active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle Intervention</span>
        </button>
      </div>

      {/* Liste des Interventions */}
      <div className="space-y-3">
        {maintenances.map((m) => (
          <div
            key={m.id}
            className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900 dark:text-white">
                  {m.vehicule_immat}
                </span>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 rounded-md">
                  {m.type_intervention}
                </span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                    m.statut === 'TERMINE'
                      ? 'bg-emerald-100 text-emerald-700'
                      : m.statut === 'EN_COURS'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {m.statut}
                </span>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300">{m.description}</p>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                <span>Date: {m.date_intervention}</span>
                {m.garage_prestataire && <span>Garage: {m.garage_prestataire}</span>}
                {m.prochain_kilometrage_prevu && (
                  <span className="text-sky-600 font-semibold">
                    Prochaine échéance: {m.prochain_kilometrage_prevu.toLocaleString()} km
                  </span>
                )}
              </div>
            </div>

            <div className="text-right">
              <div className="text-base font-bold text-slate-900 dark:text-white">
                {m.cout_total_fcfa.toLocaleString()} FCFA
              </div>
              <div className="text-[10px] text-slate-400">
                Pièces: {m.cout_pieces_fcfa.toLocaleString()} | MO: {m.cout_main_oeuvre_fcfa.toLocaleString()}
              </div>
            </div>
          </div>
        ))}

        {maintenances.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-xs bg-white dark:bg-slate-900 rounded-2xl border">
            Aucun historique de maintenance enregistré.
          </div>
        )}
      </div>

      {/* Modal Ajout Maintenance */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border p-5 max-w-lg w-full space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Programmer / Enregistrer un Entretien
              </h2>
              <button onClick={() => setModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block font-semibold mb-1">Véhicule *</label>
                <select
                  value={editingMaint.vehicule_immat || ''}
                  onChange={(e) => {
                    const sel = vehicules.find((v) => v.immatriculation === e.target.value)
                    setEditingMaint({
                      ...editingMaint,
                      vehicule_id: sel?.id,
                      vehicule_immat: sel?.immatriculation,
                      kilometrage_declenchement: sel?.kilometrage_actuel,
                      prochain_kilometrage_prevu: (sel?.kilometrage_actuel || 0) + 10000,
                    })
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                >
                  {vehicules.map((v) => (
                    <option key={v.id} value={v.immatriculation}>
                      {v.immatriculation} ({v.marque} {v.modele})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Type d'Intervention</label>
                  <select
                    value={editingMaint.type_intervention || 'VIDANGE_HUILE'}
                    onChange={(e) =>
                      setEditingMaint({
                        ...editingMaint,
                        type_intervention: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  >
                    <option value="VIDANGE_HUILE">Vidange Huile Moteur</option>
                    <option value="PNEUMATIQUES">Pneumatiques / Parallélisme</option>
                    <option value="FREINAGE">Système de Freinage</option>
                    <option value="COURROIE_DISTRIBUTION">Courroie de Distribution</option>
                    <option value="CONTROLE_TECHNIQUE">Visite Technique CNSR</option>
                    <option value="CLIMATISATION">Climatisation & Filtres</option>
                    <option value="BATTERIE">Batterie & Électricité</option>
                    <option value="AUTRE">Autre Réparation</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1">Statut</label>
                  <select
                    value={editingMaint.statut || 'TERMINE'}
                    onChange={(e) =>
                      setEditingMaint({ ...editingMaint, statut: e.target.value as any })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  >
                    <option value="TERMINE">Terminé</option>
                    <option value="EN_COURS">En cours d'atelier</option>
                    <option value="PREVU">Prévu / Planifié</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Description des Travaux *</label>
                <textarea
                  required
                  rows={2}
                  value={editingMaint.description || ''}
                  onChange={(e) =>
                    setEditingMaint({ ...editingMaint, description: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Coût Pièces (FCFA)</label>
                  <input
                    type="number"
                    value={editingMaint.cout_pieces_fcfa || 0}
                    onChange={(e) =>
                      setEditingMaint({
                        ...editingMaint,
                        cout_pieces_fcfa: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Coût Main d'Œuvre (FCFA)</label>
                  <input
                    type="number"
                    value={editingMaint.cout_main_oeuvre_fcfa || 0}
                    onChange={(e) =>
                      setEditingMaint({
                        ...editingMaint,
                        cout_main_oeuvre_fcfa: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Atelier / Garage Prestataire</label>
                <input
                  type="text"
                  placeholder="CFAO Motors, Garage Central, etc."
                  value={editingMaint.garage_prestataire || ''}
                  onChange={(e) =>
                    setEditingMaint({ ...editingMaint, garage_prestataire: e.target.value })
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
                  <span>Enregistrer</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default FlotteMaintenancePage
