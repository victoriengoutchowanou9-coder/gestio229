// =============================================================================
// GESTIO 229 SaaS — Autopartage & Réservations Internes Flotte
// Réservation des véhicules de service par les collaborateurs et validation gestionnaire
// =============================================================================

import React, { useEffect, useState } from 'react'
import {
  Calendar,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  User,
  Truck,
  X,
  Save,
  Check,
  Ban,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  getReservationsFlotte,
  saveReservationFlotte,
  getVehiculesFlotte,
  type FlotteReservation,
  type FlotteVehicule,
} from '../../../services/flotteService'

export const FlotteReservationsPage: React.FC = () => {
  const { company } = useTenant()
  const companyId = company?.id || ''

  const [reservations, setReservations] = useState<FlotteReservation[]>([])
  const [vehicules, setVehicules] = useState<FlotteVehicule[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [modalOpen, setModalOpen] = useState<boolean>(false)
  const [editingRes, setEditingRes] = useState<Partial<FlotteReservation>>({})
  const [saving, setSaving] = useState<boolean>(false)

  const loadData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [rList, vList] = await Promise.all([
        getReservationsFlotte(companyId),
        getVehiculesFlotte(companyId),
      ])
      setReservations(rList)
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
    const now = new Date()
    const later = new Date(now.getTime() + 4 * 3600 * 1000)
    setEditingRes({
      vehicule_id: v?.id,
      vehicule_immat: v?.immatriculation,
      demandeur_nom: '',
      demandeur_departement: 'Commercial',
      demandeur_telephone: '+229 ',
      motif_deplacement: 'Visite client & prospection',
      destination_prevue: 'Cotonou / Akpakpa',
      date_debut_prevue: now.toISOString(),
      date_fin_prevue: later.toISOString(),
      statut: 'EN_ATTENTE',
    })
    setModalOpen(true)
  }

  const handleStatusChange = async (res: FlotteReservation, newStatus: any) => {
    const updated = await saveReservationFlotte(companyId, {
      ...res,
      statut: newStatus,
    })
    setReservations((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingRes.demandeur_nom || !editingRes.vehicule_immat) return
    setSaving(true)
    try {
      const saved = await saveReservationFlotte(companyId, editingRes)
      setReservations((prev) => [saved, ...prev.filter((r) => r.id !== saved.id)])
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
            <Calendar className="w-6 h-6 text-sky-600" />
            <span>Autopartage & Réservations Collaborateurs</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Gestion du planning de partage des véhicules de pool de l'entreprise
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center space-x-1.5 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold shadow transition-colors active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Réserver un Véhicule</span>
        </button>
      </div>

      {/* Liste des Réservations */}
      <div className="space-y-3">
        {reservations.map((r) => (
          <div
            key={r.id}
            className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900 dark:text-white">
                  {r.vehicule_immat}
                </span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                    r.statut === 'VALIDEE'
                      ? 'bg-emerald-100 text-emerald-700'
                      : r.statut === 'EN_ATTENTE'
                      ? 'bg-amber-100 text-amber-700'
                      : r.statut === 'REFUSEE'
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {r.statut}
                </span>
              </div>

              <div className="text-xs font-medium text-slate-800 dark:text-slate-200">
                Demandeur : <strong>{r.demandeur_nom}</strong> ({r.demandeur_departement || 'Staff'})
              </div>

              <p className="text-xs text-slate-500">{r.motif_deplacement}</p>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                <span>Début: {new Date(r.date_debut_prevue).toLocaleString()}</span>
                <span>Fin: {new Date(r.date_fin_prevue).toLocaleString()}</span>
                {r.destination_prevue && <span>Dest: {r.destination_prevue}</span>}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {r.statut === 'EN_ATTENTE' && (
                <>
                  <button
                    onClick={() => handleStatusChange(r, 'VALIDEE')}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Approuver</span>
                  </button>
                  <button
                    onClick={() => handleStatusChange(r, 'REFUSEE')}
                    className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-xl text-xs font-semibold"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Refuser</span>
                  </button>
                </>
              )}
            </div>
          </div>
        ))}

        {reservations.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-xs bg-white dark:bg-slate-900 rounded-2xl border">
            Aucune réservation en cours ou passée.
          </div>
        )}
      </div>

      {/* Modal Réservation */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border p-5 max-w-md w-full space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Réserver un Véhicule de Service
              </h2>
              <button onClick={() => setModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block font-semibold mb-1">Nom du Collaborateur *</label>
                <input
                  type="text"
                  required
                  placeholder="Mme SOSSOU, M. MENSAH..."
                  value={editingRes.demandeur_nom || ''}
                  onChange={(e) =>
                    setEditingRes({ ...editingRes, demandeur_nom: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Département</label>
                  <input
                    type="text"
                    placeholder="Finance, Commercial..."
                    value={editingRes.demandeur_departement || ''}
                    onChange={(e) =>
                      setEditingRes({ ...editingRes, demandeur_departement: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Véhicule Demandé *</label>
                  <select
                    value={editingRes.vehicule_immat || ''}
                    onChange={(e) => {
                      const sel = vehicules.find((v) => v.immatriculation === e.target.value)
                      setEditingRes({
                        ...editingRes,
                        vehicule_id: sel?.id,
                        vehicule_immat: sel?.immatriculation,
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
              </div>

              <div>
                <label className="block font-semibold mb-1">Motif du Déplacement *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Rendez-vous bancaire, signature contrat..."
                  value={editingRes.motif_deplacement || ''}
                  onChange={(e) =>
                    setEditingRes({ ...editingRes, motif_deplacement: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Destination Prévue</label>
                <input
                  type="text"
                  placeholder="Porto-Novo, Parakou, Calavi..."
                  value={editingRes.destination_prevue || ''}
                  onChange={(e) =>
                    setEditingRes({ ...editingRes, destination_prevue: e.target.value })
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
                  <span>Confirmer la Demande</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default FlotteReservationsPage
