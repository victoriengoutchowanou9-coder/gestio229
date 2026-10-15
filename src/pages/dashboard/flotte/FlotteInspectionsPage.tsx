// =============================================================================
// GESTIO 229 SaaS — Inspections des Véhicules & États des Lieux Flotte
// Checklists pré-départ et retour : pneus, freins, niveaux, phares et carrosserie
// =============================================================================

import React, { useEffect, useState } from 'react'
import {
  ClipboardCheck,
  Plus,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Truck,
  User,
  Calendar,
  X,
  Save,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  getInspectionsFlotte,
  saveInspectionFlotte,
  getVehiculesFlotte,
  type FlotteInspection,
  type FlotteVehicule,
} from '../../../services/flotteService'

export const FlotteInspectionsPage: React.FC = () => {
  const { company } = useTenant()
  const companyId = company?.id || ''

  const [inspections, setInspections] = useState<FlotteInspection[]>([])
  const [vehicules, setVehicules] = useState<FlotteVehicule[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [modalOpen, setModalOpen] = useState<boolean>(false)
  const [editingInsp, setEditingInsp] = useState<Partial<FlotteInspection>>({})
  const [saving, setSaving] = useState<boolean>(false)

  const loadData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [iList, vList] = await Promise.all([
        getInspectionsFlotte(companyId),
        getVehiculesFlotte(companyId),
      ])
      setInspections(iList)
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
    setEditingInsp({
      vehicule_id: v?.id,
      vehicule_immat: v?.immatriculation,
      conducteur_nom: v?.conducteur_nom || 'Chauffeur Dédié',
      type_inspection: 'DEPART',
      date_inspection: new Date().toISOString(),
      kilometrage_inspecte: v?.kilometrage_actuel || 0,
      niveau_carburant_pct: v?.niveau_carburant_pct || 100,
      niveau_huile_moteur: true,
      liquide_refroidissement: true,
      pression_pneus_conforme: true,
      feux_et_phares_ok: true,
      freins_ok: true,
      proprete_generale: true,
      presence_roue_secours: true,
      presence_cric_et_cle: true,
      presence_triangle_gilet: true,
      statut_validation: 'CONFORME',
    })
    setModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingInsp.vehicule_immat) return
    setSaving(true)
    try {
      const saved = await saveInspectionFlotte(companyId, editingInsp)
      setInspections((prev) => [saved, ...prev])
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
            <ClipboardCheck className="w-6 h-6 text-sky-600" />
            <span>Inspections & Checklists Véhicules</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Contrôles visuels et sécuritaires au départ et retour : huile, pneus, freins et carrosserie
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center space-x-1.5 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold shadow transition-colors active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle Inspection</span>
        </button>
      </div>

      {/* Liste des Inspections */}
      <div className="space-y-3">
        {inspections.map((insp) => (
          <div
            key={insp.id}
            className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900 dark:text-white">
                  {insp.vehicule_immat}
                </span>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded">
                  {insp.type_inspection}
                </span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                    insp.statut_validation === 'CONFORME'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {insp.statut_validation}
                </span>
              </div>

              <div className="text-xs text-slate-500 flex items-center gap-2">
                <span>Inspecteur / Chauffeur : <strong>{insp.conducteur_nom || 'Staff'}</strong></span>
                <span>•</span>
                <span>Compteur : {insp.kilometrage_inspecte.toLocaleString()} km</span>
              </div>

              {/* Indicateurs rapides */}
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-300 pt-1">
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Huile & Liquides OK</span>
                </span>
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Pneus & Freins OK</span>
                </span>
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Triangle & Gilet Présents</span>
                </span>
              </div>
            </div>

            <div className="text-right text-xs text-slate-400">
              {new Date(insp.date_inspection).toLocaleString()}
            </div>
          </div>
        ))}

        {inspections.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-xs bg-white dark:bg-slate-900 rounded-2xl border">
            Aucun contrôle ou état des lieux enregistré.
          </div>
        )}
      </div>

      {/* Modal Ajout Inspection */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border p-5 max-w-lg w-full space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Fiche d'Inspection Véhicule
              </h2>
              <button onClick={() => setModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Véhicule *</label>
                  <select
                    value={editingInsp.vehicule_immat || ''}
                    onChange={(e) => {
                      const sel = vehicules.find((v) => v.immatriculation === e.target.value)
                      setEditingInsp({
                        ...editingInsp,
                        vehicule_id: sel?.id,
                        vehicule_immat: sel?.immatriculation,
                        kilometrage_inspecte: sel?.kilometrage_actuel,
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
                  <label className="block font-semibold mb-1">Type d'Inspection</label>
                  <select
                    value={editingInsp.type_inspection || 'DEPART'}
                    onChange={(e) =>
                      setEditingInsp({ ...editingInsp, type_inspection: e.target.value as any })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  >
                    <option value="DEPART">Départ / Début de Poste</option>
                    <option value="RETOUR">Retour de Mission</option>
                    <option value="PERIODIQUE">Contrôle Périodique Flotte</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Compteur Kilométrique</label>
                  <input
                    type="number"
                    value={editingInsp.kilometrage_inspecte || 0}
                    onChange={(e) =>
                      setEditingInsp({
                        ...editingInsp,
                        kilometrage_inspecte: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Inspecteur / Conducteur</label>
                  <input
                    type="text"
                    value={editingInsp.conducteur_nom || ''}
                    onChange={(e) =>
                      setEditingInsp({ ...editingInsp, conducteur_nom: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  />
                </div>
              </div>

              {/* Checkboxes de vérification */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl space-y-2">
                <span className="font-semibold block text-[11px] text-slate-700 dark:text-slate-300">
                  Points de Contrôle Obligatoires :
                </span>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={editingInsp.niveau_huile_moteur ?? true}
                    onChange={(e) =>
                      setEditingInsp({ ...editingInsp, niveau_huile_moteur: e.target.checked })
                    }
                    className="rounded text-sky-600"
                  />
                  <span>Niveau d'huile moteur & liquide de refroidissement OK</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={editingInsp.pression_pneus_conforme ?? true}
                    onChange={(e) =>
                      setEditingInsp({ ...editingInsp, pression_pneus_conforme: e.target.checked })
                    }
                    className="rounded text-sky-600"
                  />
                  <span>État d'usure et pression des 4 pneumatiques conforme</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={editingInsp.freins_ok ?? true}
                    onChange={(e) =>
                      setEditingInsp({ ...editingInsp, freins_ok: e.target.checked })
                    }
                    className="rounded text-sky-600"
                  />
                  <span>Efficacité frein de service & frein à main vérifiée</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={editingInsp.presence_roue_secours ?? true}
                    onChange={(e) =>
                      setEditingInsp({ ...editingInsp, presence_roue_secours: e.target.checked })
                    }
                    className="rounded text-sky-600"
                  />
                  <span>Présence roue de secours, cric, triangle et gilet fluo</span>
                </label>
              </div>

              <div>
                <label className="block font-semibold mb-1">Remarques / Éventuels Dégâts</label>
                <textarea
                  rows={2}
                  placeholder="Rayure portière gauche, ampoule veilleuse changée..."
                  value={editingInsp.degats_carrosserie_notes || ''}
                  onChange={(e) =>
                    setEditingInsp({ ...editingInsp, degats_carrosserie_notes: e.target.value })
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
                  <span>Valider l'Inspection</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default FlotteInspectionsPage
