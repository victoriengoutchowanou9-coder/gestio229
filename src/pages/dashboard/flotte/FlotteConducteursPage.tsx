// =============================================================================
// GESTIO 229 SaaS — Conducteurs & Permis : Registre des Chauffeurs Flotte
// Suivi permis de conduire, catégories, validité médicale, infractions & affectations
// =============================================================================

import React, { useEffect, useState } from 'react'
import {
  UserCheck,
  Plus,
  Search,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Phone,
  Mail,
  Truck,
  Edit,
  X,
  Save,
  Shield,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  getConducteursFlotte,
  saveConducteurFlotte,
  getVehiculesFlotte,
  type FlotteConducteur,
  type FlotteVehicule,
} from '../../../services/flotteService'

export const FlotteConducteursPage: React.FC = () => {
  const { company } = useTenant()
  const companyId = company?.id || ''

  const [conducteurs, setConducteurs] = useState<FlotteConducteur[]>([])
  const [vehicules, setVehicules] = useState<FlotteVehicule[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [search, setSearch] = useState<string>('')
  const [modalOpen, setModalOpen] = useState<boolean>(false)
  const [editingCond, setEditingCond] = useState<Partial<FlotteConducteur> | null>(null)
  const [saving, setSaving] = useState<boolean>(false)

  const loadData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [cList, vList] = await Promise.all([
        getConducteursFlotte(companyId),
        getVehiculesFlotte(companyId),
      ])
      setConducteurs(cList)
      setVehicules(vList)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [companyId])

  const filtered = conducteurs.filter((c) => {
    const q = search.toLowerCase().trim()
    return (
      !q ||
      c.nom_complet.toLowerCase().includes(q) ||
      c.numero_permis.toLowerCase().includes(q) ||
      (c.telephone && c.telephone.includes(q))
    )
  })

  const handleOpenAdd = () => {
    setEditingCond({
      nom_complet: '',
      telephone: '+229 ',
      email: '',
      numero_permis: '',
      categories_permis: 'B',
      points_permis: 12,
      statut: 'ACTIF',
      date_expiration_permis: new Date(Date.now() + 365 * 86400 * 1000 * 5)
        .toISOString()
        .slice(0, 10),
    })
    setModalOpen(true)
  }

  const handleOpenEdit = (c: FlotteConducteur) => {
    setEditingCond({ ...c })
    setModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCond?.nom_complet || !editingCond?.numero_permis) return
    setSaving(true)
    try {
      const saved = await saveConducteurFlotte(companyId, editingCond)
      setConducteurs((prev) => {
        const idx = prev.findIndex((c) => c.id === saved.id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = saved
          return next
        }
        return [saved, ...prev]
      })
      setModalOpen(false)
      setEditingCond(null)
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
            <UserCheck className="w-6 h-6 text-sky-600" />
            <span>Gestion des Conducteurs & Permis</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Régistre officiel des chauffeurs, validité des permis, visites médicales et affectations
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center space-x-1.5 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold shadow transition-colors active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Nouveau Conducteur</span>
        </button>
      </div>

      {/* Barre recherche */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Rechercher chauffeur, numéro de permis, téléphone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {/* Grille des Conducteurs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((c) => {
          // Vérification expiration permis
          const isExpiringSoon =
            c.date_expiration_permis &&
            new Date(c.date_expiration_permis).getTime() - Date.now() < 30 * 86400 * 1000

          return (
            <div
              key={c.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4 hover:border-sky-500/50 transition-colors flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 font-bold flex items-center justify-center text-sm">
                      {c.nom_complet
                        .split(' ')
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join('')}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                        {c.nom_complet}
                      </h3>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {c.numero_permis}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                      c.statut === 'ACTIF'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                        : c.statut === 'EN_MISSION'
                        ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {c.statut}
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">Catégories Permis :</span>
                    <span className="font-bold text-sky-600 dark:text-sky-400">
                      {c.categories_permis}
                    </span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">Expiration Permis :</span>
                    <span
                      className={`font-semibold flex items-center gap-1 ${
                        isExpiringSoon ? 'text-rose-600 font-bold' : 'text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {isExpiringSoon && <AlertCircle className="w-3.5 h-3.5 text-rose-500" />}
                      <span>{c.date_expiration_permis || 'Non renseignée'}</span>
                    </span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">Véhicule Assigné :</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                      <Truck className="w-3 h-3 text-slate-400" />
                      <span>{c.vehicule_immatriculation || 'Aucun'}</span>
                    </span>
                  </div>

                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Points & Sécurité :</span>
                    <span className="font-bold text-emerald-600">
                      {c.points_permis} / 12 pts
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">{c.telephone}</span>
                <button
                  onClick={() => handleOpenEdit(c)}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-semibold transition-colors"
                >
                  Modifier
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal */}
      {modalOpen && editingCond && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {editingCond.id ? 'Modifier Conducteur' : 'Nouveau Conducteur'}
              </h2>
              <button onClick={() => setModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block font-semibold mb-1">Nom et Prénom *</label>
                <input
                  type="text"
                  required
                  placeholder="Bio Séro KORA"
                  value={editingCond.nom_complet || ''}
                  onChange={(e) => setEditingCond({ ...editingCond, nom_complet: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">N° Permis de Conduire *</label>
                  <input
                    type="text"
                    required
                    placeholder="BJ-2020-0012"
                    value={editingCond.numero_permis || ''}
                    onChange={(e) =>
                      setEditingCond({ ...editingCond, numero_permis: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Catégories (B, C, D...)</label>
                  <input
                    type="text"
                    placeholder="B-C-D"
                    value={editingCond.categories_permis || ''}
                    onChange={(e) =>
                      setEditingCond({ ...editingCond, categories_permis: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Téléphone</label>
                  <input
                    type="text"
                    placeholder="+229 97 00 00 00"
                    value={editingCond.telephone || ''}
                    onChange={(e) => setEditingCond({ ...editingCond, telephone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Expiration Permis</label>
                  <input
                    type="date"
                    value={editingCond.date_expiration_permis || ''}
                    onChange={(e) =>
                      setEditingCond({ ...editingCond, date_expiration_permis: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Véhicule Assigné</label>
                <select
                  value={editingCond.vehicule_immatriculation || ''}
                  onChange={(e) =>
                    setEditingCond({
                      ...editingCond,
                      vehicule_immatriculation: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                >
                  <option value="">-- Aucun --</option>
                  {vehicules.map((v) => (
                    <option key={v.id} value={v.immatriculation}>
                      {v.immatriculation} ({v.marque} {v.modele})
                    </option>
                  ))}
                </select>
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

export default FlotteConducteursPage
