// =============================================================================
// GESTIO 229 — Station-Service : Clients Flottes, Véhicules & Bons Carburant
// =============================================================================
// Gestion des entreprises clientes, véhicules rattachés, chauffeurs et plafonds
// Isolation stricte : company_id + sector_slug = 'station-service'
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Car, Building2, User, CreditCard, Plus, RefreshCw, AlertTriangle,
  CheckCircle, Search, X, ShieldAlert, FileText
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'

interface VehiculeFlotte {
  id: string
  client_nom: string
  immatriculation: string
  marque_modele?: string
  chauffeur_habituel?: string
  telephone_chauffeur?: string
  type_carburant_autorise: string
  plafond_journalier_litres: number
  plafond_mensuel_fcfa: number
  consommation_mois_litres: number
  consommation_mois_fcfa: number
  statut: string
  notes?: string
}

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))

export const FlottesClientsPage: React.FC = () => {
  const { companyId, sectorSlug } = useTenant()
  const { toast } = useUIStore() as any

  const [vehicules, setVehicules] = useState<VehiculeFlotte[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)

  const [form, setForm] = useState({
    client_nom: '',
    immatriculation: '',
    marque_modele: '',
    chauffeur_habituel: '',
    telephone_chauffeur: '',
    type_carburant_autorise: 'Tous',
    plafond_journalier_litres: 100,
    plafond_mensuel_fcfa: 500000,
    notes: ''
  })

  const notify = useCallback((type: 'success' | 'error', msg: string) => {
    try {
      if (toast?.[type]) toast[type](msg)
      else if (type === 'error') window.alert(msg)
    } catch { /* noop */ }
  }, [toast])

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const cleanSlug = sectorSlug || 'station-service'
      const { data } = await supabase
        .from('station_vehicules_flotte')
        .select('*')
        .eq('company_id', companyId)
        .eq('sector_slug', cleanSlug)
        .order('client_nom')
      setVehicules(data || [])
    } catch (err: any) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [companyId, sectorSlug])

  useEffect(() => { loadData() }, [loadData])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.client_nom || !form.immatriculation) {
      return notify('error', 'Entreprise cliente et immatriculation requises')
    }
    try {
      const cleanSlug = sectorSlug || 'station-service'
      const payload = {
        company_id: companyId,
        sector_slug: cleanSlug,
        client_nom: form.client_nom,
        immatriculation: form.immatriculation.toUpperCase().trim(),
        marque_modele: form.marque_modele,
        chauffeur_habituel: form.chauffeur_habituel,
        telephone_chauffeur: form.telephone_chauffeur,
        type_carburant_autorise: form.type_carburant_autorise,
        plafond_journalier_litres: Number(form.plafond_journalier_litres) || 0,
        plafond_mensuel_fcfa: Number(form.plafond_mensuel_fcfa) || 0,
        consommation_mois_litres: 0,
        consommation_mois_fcfa: 0,
        statut: 'ACTIF',
        notes: form.notes
      }
      const { error } = await supabase.from('station_vehicules_flotte').insert(payload)
      if (error) throw error

      notify('success', 'Véhicule de flotte enregistré')
      setShowModal(false)
      loadData()
    } catch (err: any) {
      notify('error', err.message || 'Erreur lors de l\'enregistrement')
    }
  }

  const filtered = vehicules.filter(v =>
    v.client_nom.toLowerCase().includes(search.toLowerCase()) ||
    v.immatriculation.toLowerCase().includes(search.toLowerCase()) ||
    (v.chauffeur_habituel || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* ─── En-tête ─── */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-100 text-indigo-700 rounded-2xl">
            <Car className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Clients Entreprises & Flottes</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Gestion des véhicules d'entreprises, chauffeurs autorisés et plafonds de crédit carburant
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
            title="Actualiser"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" /> Enregistrer un Véhicule
          </button>
        </div>
      </div>

      {/* ─── Barre de Recherche ─── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex items-center gap-2">
        <Search className="w-4 h-4 text-slate-400 ml-2" />
        <input
          type="text"
          placeholder="Rechercher par immatriculation, entreprise ou chauffeur…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full text-xs text-slate-800 bg-transparent focus:outline-none"
        />
      </div>

      {/* ─── Grille des Véhicules & Flottes ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-white rounded-3xl border border-slate-200 p-8">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="font-bold text-slate-700">Aucun véhicule de flotte enregistré</p>
            <p className="text-xs text-slate-400 mt-1 mb-4">Enregistrez les véhicules des entreprises partenaires pour autoriser les bons et crédits carburant.</p>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm"
            >
              + Enregistrer le premier véhicule
            </button>
          </div>
        ) : (
          filtered.map(v => (
            <div key={v.id} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition">
              <div>
                <div className="flex items-center justify-between">
                  <span className="p-2 bg-slate-900 text-white font-mono font-black text-sm rounded-xl tracking-wider">
                    {v.immatriculation}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    {v.statut}
                  </span>
                </div>

                <div className="mt-3">
                  <h3 className="font-black text-slate-900 text-base">{v.client_nom}</h3>
                  <p className="text-xs text-slate-500 font-semibold">{v.marque_modele || 'Modèle non précisé'}</p>
                </div>

                <div className="my-4 p-3.5 bg-slate-50 rounded-2xl space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Chauffeur :</span>
                    <span className="font-bold text-slate-700">{v.chauffeur_habituel || 'Non assigné'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Carburant :</span>
                    <span className="font-bold text-orange-600">{v.type_carburant_autorise}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1.5">
                    <span className="text-slate-400">Plafond jour :</span>
                    <span className="font-mono font-bold text-slate-800">{v.plafond_journalier_litres} L / jour</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Plafond mensuel :</span>
                    <span className="font-mono font-black text-indigo-700">{fmt(v.plafond_mensuel_fcfa)} FCFA</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 text-[11px] text-slate-400 flex items-center justify-between">
                <span>{v.telephone_chauffeur || 'Pas de contact tel'}</span>
                <span className="font-bold text-indigo-600">Bon carburant OK</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ─── MODALE ENREGISTRER VÉHICULE FLOTTE ─── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-black text-slate-900 text-base flex items-center gap-2">
                <Car className="w-5 h-5 text-indigo-600" /> Enregistrer un Véhicule d'Entreprise
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700">Entreprise / Client Flotte *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Société Bénin Logistique, Ministère..."
                  value={form.client_nom}
                  onChange={e => setForm({ ...form, client_nom: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Immatriculation *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: RB 1234 AH"
                    value={form.immatriculation}
                    onChange={e => setForm({ ...form, immatriculation: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-mono font-black"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Marque & Modèle</label>
                  <input
                    type="text"
                    placeholder="Ex: Toyota Hilux 4x4"
                    value={form.marque_modele}
                    onChange={e => setForm({ ...form, marque_modele: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Chauffeur habituel</label>
                  <input
                    type="text"
                    placeholder="Nom du chauffeur"
                    value={form.chauffeur_habituel}
                    onChange={e => setForm({ ...form, chauffeur_habituel: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Téléphone Chauffeur</label>
                  <input
                    type="tel"
                    placeholder="+229 ..."
                    value={form.telephone_chauffeur}
                    onChange={e => setForm({ ...form, telephone_chauffeur: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Carburant autorisé</label>
                <select
                  value={form.type_carburant_autorise}
                  onChange={e => setForm({ ...form, type_carburant_autorise: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-bold text-slate-800"
                >
                  <option value="Tous">Tous les carburants</option>
                  <option value="Gasoil">Gasoil Uniquement</option>
                  <option value="Essence Super">Essence Super Uniquement</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Plafond jour (Litres)</label>
                  <input
                    type="number"
                    value={form.plafond_journalier_litres}
                    onChange={e => setForm({ ...form, plafond_journalier_litres: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Plafond mensuel (FCFA)</label>
                  <input
                    type="number"
                    value={form.plafond_mensuel_fcfa}
                    onChange={e => setForm({ ...form, plafond_mensuel_fcfa: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-mono font-bold text-indigo-700"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm">Enregistrer le véhicule</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
export default FlottesClientsPage
