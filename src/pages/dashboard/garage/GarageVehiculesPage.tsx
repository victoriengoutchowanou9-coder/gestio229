// =============================================================================
// GESTIO 229 SaaS — Véhicules Clients & Dossiers Techniques
// Conforme Spécification Section 4.2
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Car, Plus, Search, Edit3, Trash2, Calendar, Shield, Clock,
  Filter, CheckCircle2, AlertTriangle, Eye, ChevronRight, X,
  FileText, Wrench, Download, RefreshCw, User, Phone, Sparkles
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { GarageVehicule } from '../../../services/garageService'
import { showConfirm } from '../../../components/modals/CustomModalGestio'
import clsx from 'clsx'

export const GarageVehiculesPage: React.FC = () => {
  const { companyId, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  const [vehicules, setVehicules] = useState<GarageVehicule[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCarburant, setFilterCarburant] = useState<string>('TOUS')

  // Modale Création / Édition
  const [showModal, setShowModal] = useState(false)
  const [editingVehicule, setEditingVehicule] = useState<GarageVehicule | null>(null)
  const [form, setForm] = useState({
    immatriculation: '',
    marque: '',
    modele: '',
    annee: new Date().getFullYear(),
    vin: '',
    carburant: 'Essence',
    motorisation: '',
    couleur: '',
    compteur_km: 0,
    client_nom: '',
    client_telephone: '',
    date_premiere_circulation: '',
    date_expiration_assurance: '',
    date_visite_technique: '',
    notes: '',
  })

  // Modale Historique Véhicule
  const [selectedVehiculeForHistory, setSelectedVehiculeForHistory] = useState<GarageVehicule | null>(null)
  const [vehicleHistory, setVehicleHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const loadVehicules = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const { data, error } = await supabaseTenant('garage_clients_vehicules')
        .select('*')
        .order('immatriculation', { ascending: true })

      if (error) throw error
      setVehicules(data || [])
    } catch (err: any) {
      console.warn('[GarageVehicules] Erreur chargement véhicules:', err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadVehicules()
  }, [loadVehicules])

  const openCreateModal = () => {
    setEditingVehicule(null)
    setForm({
      immatriculation: '',
      marque: '',
      modele: '',
      annee: new Date().getFullYear(),
      vin: '',
      carburant: 'Essence',
      motorisation: '',
      couleur: '',
      compteur_km: 0,
      client_nom: '',
      client_telephone: '',
      date_premiere_circulation: '',
      date_expiration_assurance: '',
      date_visite_technique: '',
      notes: '',
    })
    setShowModal(true)
  }

  const openEditModal = (v: GarageVehicule) => {
    setEditingVehicule(v)
    setForm({
      immatriculation: v.immatriculation,
      marque: v.marque,
      modele: v.modele,
      annee: v.annee || new Date().getFullYear(),
      vin: v.vin || '',
      carburant: v.carburant || 'Essence',
      motorisation: v.motorisation || '',
      couleur: v.couleur || '',
      compteur_km: v.compteur_km || 0,
      client_nom: v.client_nom,
      client_telephone: v.client_telephone || '',
      date_premiere_circulation: v.date_premiere_circulation || '',
      date_expiration_assurance: v.date_expiration_assurance || '',
      date_visite_technique: v.date_visite_technique || '',
      notes: v.notes || '',
    })
    setShowModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.immatriculation.trim() || !form.marque.trim() || !form.client_nom.trim()) {
      toast.error('Champs requis', "Veuillez renseigner l'immatriculation, la marque et le client.")
      return
    }

    try {
      if (editingVehicule) {
        const { error } = await supabaseTenant('garage_clients_vehicules')
          .update({
            ...form,
            immatriculation: form.immatriculation.toUpperCase().trim(),
            updated_at: new Date().toISOString()
          })
          .eq('id', editingVehicule.id)
        if (error) throw error
        toast.success('Véhicule mis à jour', `La fiche de ${form.immatriculation} a été actualisée.`)
      } else {
        const { error } = await supabaseTenant('garage_clients_vehicules')
          .insert([{
            company_id: companyId,
            ...form,
            immatriculation: form.immatriculation.toUpperCase().trim(),
            statut: 'ACTIF'
          }])
        if (error) throw error
        toast.success('Véhicule enregistré', `Le véhicule ${form.immatriculation} est maintenant répertorié.`)
      }
      setShowModal(false)
      loadVehicules()
    } catch (err: any) {
      toast.error('Erreur', err.message || 'Impossible d\'enregistrer le véhicule.')
    }
  }

  const handleDelete = async (v: GarageVehicule) => {
    const ok = await showConfirm(`Supprimer définitivement le véhicule ${v.immatriculation} ?`, 'Suppression véhicule')
    if (!ok) return
    try {
      const { error } = await supabaseTenant('garage_clients_vehicules').delete().eq('id', v.id)
      if (error) throw error
      toast.success('Véhicule supprimé', `Le véhicule ${v.immatriculation} a été retiré.`)
      loadVehicules()
    } catch (err: any) {
      toast.error('Erreur suppression', err.message)
    }
  }

  const openHistory = async (v: GarageVehicule) => {
    setSelectedVehiculeForHistory(v)
    setLoadingHistory(true)
    try {
      const { data } = await supabaseTenant('garage_ordres_reparation')
        .select('*')
        .eq('immatriculation', v.immatriculation)
        .order('date_entree', { ascending: false })
      setVehicleHistory(data || [])
    } catch (err) {
      setVehicleHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }

  const filteredVehicules = useMemo(() => {
    return vehicules.filter((v) => {
      const matchesSearch =
        !search ||
        v.immatriculation.toLowerCase().includes(search.toLowerCase()) ||
        v.marque.toLowerCase().includes(search.toLowerCase()) ||
        v.modele.toLowerCase().includes(search.toLowerCase()) ||
        v.client_nom.toLowerCase().includes(search.toLowerCase()) ||
        (v.vin && v.vin.toLowerCase().includes(search.toLowerCase()))

      const matchesCarburant = filterCarburant === 'TOUS' || v.carburant === filterCarburant
      return matchesSearch && matchesCarburant
    })
  }, [vehicules, search, filterCarburant])

  return (
    <div className="space-y-6">
      {/* ── En-tête ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Car className="w-6 h-6 text-emerald-600" />
            Parc Véhicules & Clients
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Fiches d'identification, historique des réparations, visites techniques et assurances.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nouveau Véhicule
          </button>
          <button
            onClick={loadVehicules}
            className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition"
            title="Actualiser"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* ── Barre de recherche & Filtres ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par immatriculation, marque, modèle, client ou VIN..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        <select
          value={filterCarburant}
          onChange={(e) => setFilterCarburant(e.target.value)}
          className="px-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
        >
          <option value="TOUS">Tous carburants</option>
          <option value="Essence">Essence</option>
          <option value="Diesel">Diesel</option>
          <option value="Hybride">Hybride</option>
          <option value="Electrique">Électrique</option>
          <option value="Gaz">Gaz</option>
        </select>
      </div>

      {/* ── Liste des Véhicules ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {filteredVehicules.length === 0 ? (
          <div className="text-center py-12 p-6">
            <Car className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-1">Aucun véhicule trouvé</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-4">
              Enregistrez les véhicules confiés par vos clients pour démarrer le suivi d'atelier.
            </p>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Ajouter un Véhicule
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Immatriculation</th>
                  <th className="py-3 px-4">Véhicule (Marque / Modèle)</th>
                  <th className="py-3 px-4">Client & Contact</th>
                  <th className="py-3 px-4">Kilométrage</th>
                  <th className="py-3 px-4">Carburant</th>
                  <th className="py-3 px-4">Échéances Légales</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredVehicules.map((v) => {
                  const now = new Date()
                  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
                  const assurExp = v.date_expiration_assurance ? new Date(v.date_expiration_assurance) : null
                  const visiteExp = v.date_visite_technique ? new Date(v.date_visite_technique) : null
                  const alertAssur = assurExp && assurExp <= in30
                  const alertVisite = visiteExp && visiteExp <= in30

                  return (
                    <tr key={v.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-mono font-black text-sm text-slate-900 dark:text-white">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
                          {v.immatriculation}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {v.marque} {v.modele} {v.annee ? `(${v.annee})` : ''}
                        </div>
                        {v.vin && <div className="text-[10px] text-slate-400 font-mono">VIN: {v.vin}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{v.client_nom}</span>
                        </div>
                        {v.client_telephone && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{v.client_telephone}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-700 dark:text-slate-300">
                        {Number(v.compteur_km || 0).toLocaleString()} km
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {v.carburant || 'Essence'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          {v.date_visite_technique && (
                            <div className={clsx('text-[11px] flex items-center gap-1', alertVisite ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-500 dark:text-slate-400')}>
                              <span>Visite : {new Date(v.date_visite_technique).toLocaleDateString()}</span>
                              {alertVisite && <AlertTriangle className="w-3 h-3 text-rose-500" />}
                            </div>
                          )}
                          {v.date_expiration_assurance && (
                            <div className={clsx('text-[11px] flex items-center gap-1', alertAssur ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-slate-500 dark:text-slate-400')}>
                              <span>Assurance : {new Date(v.date_expiration_assurance).toLocaleDateString()}</span>
                              {alertAssur && <Shield className="w-3 h-3 text-amber-500" />}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openHistory(v)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-800 transition"
                            title="Historique réparations"
                          >
                            <Clock className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEditModal(v)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 transition"
                            title="Modifier"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(v)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 transition"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modale Création / Édition ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-2xl w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-5">
              <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <Car className="w-5 h-5 text-emerald-600" />
                {editingVehicule ? 'Modifier Véhicule' : 'Enregistrer un Véhicule Client'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Immatriculation *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.immatriculation}
                    onChange={(e) => setForm({ ...form, immatriculation: e.target.value })}
                    placeholder="Ex: AB 1234 RB"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Client Propriétaire *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.client_nom}
                    onChange={(e) => setForm({ ...form, client_nom: e.target.value })}
                    placeholder="Nom du particulier ou société"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Marque *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.marque}
                    onChange={(e) => setForm({ ...form, marque: e.target.value })}
                    placeholder="Toyota, Peugeot, Mercedes..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Modèle *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.modele}
                    onChange={(e) => setForm({ ...form, modele: e.target.value })}
                    placeholder="Corolla, RAV4, 208..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Année
                  </label>
                  <input
                    type="number"
                    value={form.annee}
                    onChange={(e) => setForm({ ...form, annee: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Carburant
                  </label>
                  <select
                    value={form.carburant}
                    onChange={(e) => setForm({ ...form, carburant: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="Essence">Essence</option>
                    <option value="Diesel">Diesel</option>
                    <option value="Hybride">Hybride</option>
                    <option value="Electrique">Électrique</option>
                    <option value="Gaz">Gaz</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Compteur Kilométrique (KM)
                  </label>
                  <input
                    type="number"
                    value={form.compteur_km}
                    onChange={(e) => setForm({ ...form, compteur_km: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    N° Téléphone Client
                  </label>
                  <input
                    type="text"
                    value={form.client_telephone}
                    onChange={(e) => setForm({ ...form, client_telephone: e.target.value })}
                    placeholder="+229 ..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Échéance Visite Technique
                  </label>
                  <input
                    type="date"
                    value={form.date_visite_technique}
                    onChange={(e) => setForm({ ...form, date_visite_technique: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Échéance Assurance
                  </label>
                  <input
                    type="date"
                    value={form.date_expiration_assurance}
                    onChange={(e) => setForm({ ...form, date_expiration_assurance: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Numéro de Série / VIN / Châssis
                </label>
                <input
                  type="text"
                  value={form.vin}
                  onChange={(e) => setForm({ ...form, vin: e.target.value })}
                  placeholder="Numéro à 17 caractères sur la carte grise"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Notes & Particularités
                </label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Observations particulières sur le véhicule..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition"
                >
                  {editingVehicule ? 'Mettre à jour' : 'Enregistrer le véhicule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modale Historique Véhicule ── */}
      {selectedVehiculeForHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-3xl w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-5">
              <div>
                <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-emerald-600" />
                  Historique Complet : {selectedVehiculeForHistory.immatriculation}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedVehiculeForHistory.marque} {selectedVehiculeForHistory.modele} — Propriétaire : {selectedVehiculeForHistory.client_nom}
                </p>
              </div>
              <button onClick={() => setSelectedVehiculeForHistory(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingHistory ? (
              <div className="text-center py-8 text-xs text-slate-500">Chargement de l'historique...</div>
            ) : vehicleHistory.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                Aucune intervention ou ordre de réparation archivé pour ce véhicule.
              </div>
            ) : (
              <div className="space-y-3">
                {vehicleHistory.map((item) => (
                  <div key={item.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-slate-800 dark:text-slate-200">{item.numero_or}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          {item.statut}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 font-medium">
                        {item.description_travaux || 'Révision et entretien général'}
                      </p>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Date d'entrée : {new Date(item.date_entree).toLocaleDateString()} — Mécanicien : {item.mecanicien_nom || 'Atelier'}
                      </div>
                    </div>

                    <div className="text-right sm:flex-shrink-0">
                      <div className="text-sm font-black text-slate-900 dark:text-white">
                        {Number(item.montant_ttc || 0).toLocaleString()} FCFA
                      </div>
                      {item.km_entree && (
                        <div className="text-[10px] text-slate-400 font-mono">
                          Relevé : {Number(item.km_entree).toLocaleString()} km
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default GarageVehiculesPage
