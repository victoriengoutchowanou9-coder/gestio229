// =============================================================================
// GESTIO 229 SaaS — Assurances & Documents Flotte
// Suivi carte grise, assurance, visite technique, TVM et alertes d'expiration
// =============================================================================

import React, { useEffect, useState } from 'react'
import {
  FileText,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Truck,
  Shield,
  Clock,
  X,
  Save,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  getDocumentsFlotte,
  saveDocumentFlotte,
  getVehiculesFlotte,
  type FlotteDocument,
  type FlotteVehicule,
} from '../../../services/flotteService'

export const FlotteDocumentsPage: React.FC = () => {
  const { company } = useTenant()
  const companyId = company?.id || ''

  const [documents, setDocuments] = useState<FlotteDocument[]>([])
  const [vehicules, setVehicules] = useState<FlotteVehicule[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [modalOpen, setModalOpen] = useState<boolean>(false)
  const [editingDoc, setEditingDoc] = useState<Partial<FlotteDocument>>({})
  const [saving, setSaving] = useState<boolean>(false)

  const loadData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [dList, vList] = await Promise.all([
        getDocumentsFlotte(companyId),
        getVehiculesFlotte(companyId),
      ])
      setDocuments(dList)
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
    setEditingDoc({
      vehicule_id: v?.id,
      vehicule_immat: v?.immatriculation,
      type_document: 'ASSURANCE',
      organisme_emetteur: 'NSIA Assurances Bénin',
      numero_police_ou_titre: '',
      date_emission: new Date().toISOString().slice(0, 10),
      date_expiration: new Date(Date.now() + 365 * 86400 * 1000).toISOString().slice(0, 10),
      cout_fcfa: 250000,
      statut_alerte: 'VALIDE',
    })
    setModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingDoc.vehicule_immat || !editingDoc.date_expiration) return
    setSaving(true)
    try {
      const saved = await saveDocumentFlotte(companyId, editingDoc)
      setDocuments((prev) => [saved, ...prev.filter((d) => d.id !== saved.id)])
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
            <FileText className="w-6 h-6 text-sky-600" />
            <span>Assurances, Cartes Grises & Documents Flotte</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Conformité légale des véhicules : assurance, contrôle technique CNSR, TVM et vignettes
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center space-x-1.5 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold shadow transition-colors active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Ajouter Document</span>
        </button>
      </div>

      {/* Grille des Documents */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {documents.map((d) => {
          const diffDays = Math.ceil(
            (new Date(d.date_expiration).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          )
          const isExpired = diffDays < 0
          const isWarning = diffDays >= 0 && diffDays <= 30

          return (
            <div
              key={d.id}
              className={`p-5 rounded-2xl border shadow-sm space-y-3.5 bg-white dark:bg-slate-900 ${
                isExpired
                  ? 'border-rose-500/50 ring-1 ring-rose-500/30'
                  : isWarning
                  ? 'border-amber-500/50 ring-1 ring-amber-500/30'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                    {d.type_document}
                  </span>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    {d.vehicule_immat || 'Véhicule'}
                  </h3>
                </div>

                <span
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                    isExpired
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400'
                      : isWarning
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                  }`}
                >
                  {isExpired ? 'Expiré' : isWarning ? `Expire dans ${diffDays}j` : 'Valide'}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Organisme :</span>
                  <span className="font-semibold">{d.organisme_emetteur || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Police / N° :</span>
                  <span className="font-mono">{d.numero_police_ou_titre || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Date d'Expiration :</span>
                  <span className={`font-bold ${isExpired ? 'text-rose-600' : isWarning ? 'text-amber-600' : ''}`}>
                    {d.date_expiration}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Coût Annuel :</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {d.cout_fcfa.toLocaleString()} FCFA
                  </span>
                </div>
              </div>
            </div>
          )
        })}

        {documents.length === 0 && (
          <div className="col-span-3 p-12 text-center text-slate-400 text-xs bg-white dark:bg-slate-900 rounded-2xl border">
            Aucun document légal enregistré.
          </div>
        )}
      </div>

      {/* Modal Ajout Document */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border p-5 max-w-md w-full space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Ajouter un Document Officiel
              </h2>
              <button onClick={() => setModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block font-semibold mb-1">Véhicule Concerne *</label>
                <select
                  value={editingDoc.vehicule_immat || ''}
                  onChange={(e) => {
                    const sel = vehicules.find((v) => v.immatriculation === e.target.value)
                    setEditingDoc({
                      ...editingDoc,
                      vehicule_id: sel?.id,
                      vehicule_immat: sel?.immatriculation,
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

              <div>
                <label className="block font-semibold mb-1">Type de Document *</label>
                <select
                  value={editingDoc.type_document || 'ASSURANCE'}
                  onChange={(e) =>
                    setEditingDoc({ ...editingDoc, type_document: e.target.value as any })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                >
                  <option value="ASSURANCE">Assurance Automobile</option>
                  <option value="VISITE_TECHNIQUE">Visite Technique (CNSR)</option>
                  <option value="TVM">Taxe sur Véhicules à Moteur (TVM - DGI)</option>
                  <option value="CARTE_GRISE">Carte Grise</option>
                  <option value="EXTINCTEUR">Certificat Extincteur</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">Compagnie / Organisme Émetteur</label>
                <input
                  type="text"
                  placeholder="NSIA, Sanlam, CNSR, DGI..."
                  value={editingDoc.organisme_emetteur || ''}
                  onChange={(e) =>
                    setEditingDoc({ ...editingDoc, organisme_emetteur: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">N° Police / Titre</label>
                  <input
                    type="text"
                    value={editingDoc.numero_police_ou_titre || ''}
                    onChange={(e) =>
                      setEditingDoc({ ...editingDoc, numero_police_ou_titre: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Date d'Expiration *</label>
                  <input
                    type="date"
                    required
                    value={editingDoc.date_expiration || ''}
                    onChange={(e) =>
                      setEditingDoc({ ...editingDoc, date_expiration: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Coût Annuel (FCFA)</label>
                <input
                  type="number"
                  value={editingDoc.cout_fcfa || 0}
                  onChange={(e) =>
                    setEditingDoc({ ...editingDoc, cout_fcfa: Number(e.target.value) })
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

export default FlotteDocumentsPage
