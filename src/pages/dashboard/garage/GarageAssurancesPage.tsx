// =============================================================================
// GESTIO 229 SaaS — Assurances & Gestion des Sinistres Garage
// Conforme Spécification Section 4.8
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Shield, Plus, Search, FileText, CheckCircle2, AlertTriangle,
  DollarSign, User, Phone, Calendar, X, RefreshCw, Eye
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { formatFCFA } from '../../../utils/tax'
import { GarageAssuranceSinistre } from '../../../services/garageService'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

export const GarageAssurancesPage: React.FC = () => {
  const { companyId, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  const [sinistres, setSinistres] = useState<GarageAssuranceSinistre[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modale Nouveau Dossier Sinistre
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    compagnie_assurance: '',
    numero_police: '',
    numero_sinistre: '',
    expert_nom: '',
    expert_tel: '',
    immatriculation: '',
    client_nom: '',
    montant_devis_soumis: 0,
    montant_accord_assurance: 0,
    franchise_client: 0,
    statut_prise_en_charge: 'EN_ATTENTE_ACCORD',
    date_sinistre: '',
    date_expertise: '',
    notes: '',
  })

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const { data, error } = await supabaseTenant('garage_assurances_sinistres')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setSinistres(data || [])
    } catch (err: any) {
      console.warn('[GarageAssurances] Erreur chargement sinistres:', err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.compagnie_assurance.trim() || !form.immatriculation.trim() || !form.client_nom.trim()) {
      toast.error('Champs requis', "Veuillez renseigner la compagnie, l'immatriculation et le client.")
      return
    }

    try {
      const numDos = `SIN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
      const accord = Number(form.montant_accord_assurance) || 0
      const franchise = Number(form.franchise_client) || 0
      const devis = Number(form.montant_devis_soumis) || 0
      const resteCharge = Math.max(0, devis - accord + franchise)

      const payload: Partial<GarageAssuranceSinistre> = {
        company_id: companyId || '',
        numero_dossier: numDos,
        compagnie_assurance: form.compagnie_assurance,
        numero_police: form.numero_police,
        numero_sinistre: form.numero_sinistre,
        expert_nom: form.expert_nom,
        expert_tel: form.expert_tel,
        immatriculation: form.immatriculation.toUpperCase().trim(),
        client_nom: form.client_nom,
        montant_devis_soumis: devis,
        montant_accord_assurance: accord,
        franchise_client: franchise,
        reste_a_charge_client: resteCharge,
        statut_prise_en_charge: form.statut_prise_en_charge as any,
        date_sinistre: form.date_sinistre || undefined,
        date_expertise: form.date_expertise || undefined,
        notes: form.notes
      }

      const { error } = await supabaseTenant('garage_assurances_sinistres').insert([payload])
      if (error) throw error

      toast.success('Dossier créé', `Sinistre ${numDos} enregistré avec succès.`)
      setShowModal(false)
      loadData()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    }
  }

  const filteredSinistres = sinistres.filter(s =>
    !search ||
    s.numero_dossier.toLowerCase().includes(search.toLowerCase()) ||
    s.compagnie_assurance.toLowerCase().includes(search.toLowerCase()) ||
    s.immatriculation.toLowerCase().includes(search.toLowerCase()) ||
    s.client_nom.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* ── En-tête ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-emerald-600" />
            Assurances & Gestion des Sinistres
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Prises en charge, accords d'expertise, suivi indépendant de la part assureur et de la franchise client.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nouveau Dossier Sinistre
          </button>
          <button
            onClick={loadData}
            className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition"
            title="Actualiser"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* ── Recherche ── */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par N° dossier, assurance, véhicule ou client..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
        />
      </div>

      {/* ── Liste des Sinistres ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {filteredSinistres.length === 0 ? (
          <div className="text-center py-12 p-6">
            <Shield className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-1">Aucun dossier sinistre</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-4">
              Enregistrez les dossiers de sinistre pour suivre les accords d'assurance et les créances.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Créer un Dossier Sinistre
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">N° Dossier</th>
                  <th className="py-3 px-4">Assurance</th>
                  <th className="py-3 px-4">Véhicule</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4 text-right">Devis Soumis</th>
                  <th className="py-3 px-4 text-right">Accord Assurance</th>
                  <th className="py-3 px-4 text-right">Franchise Client</th>
                  <th className="py-3 px-4">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredSinistres.map((sin) => (
                  <tr key={sin.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-mono font-black text-slate-900 dark:text-white">
                      {sin.numero_dossier}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                      {sin.compagnie_assurance}
                      {sin.expert_nom && <div className="text-[10px] text-slate-400 font-normal">Exp: {sin.expert_nom}</div>}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
                        {sin.immatriculation}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-800 dark:text-slate-200">
                      {sin.client_nom}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-slate-700 dark:text-slate-300">
                      {fmt(sin.montant_devis_soumis || 0)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      {fmt(sin.montant_accord_assurance || 0)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-amber-600 dark:text-amber-400">
                      {fmt(sin.franchise_client || 0)}
                    </td>
                    <td className="py-3 px-4">
                      <span className={clsx(
                        'px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider',
                        sin.statut_prise_en_charge === 'ACCORDE' ? 'bg-emerald-100 text-emerald-800' :
                        sin.statut_prise_en_charge === 'REGLE' ? 'bg-blue-100 text-blue-800' :
                        sin.statut_prise_en_charge === 'REFUSE' ? 'bg-rose-100 text-rose-800' :
                        'bg-amber-100 text-amber-800'
                      )}>
                        {sin.statut_prise_en_charge}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modale Formulaire Sinistre ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-2xl w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-600" />
                Nouveau Dossier Sinistre / Assurance
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Compagnie d'Assurance *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.compagnie_assurance}
                    onChange={(e) => setForm({ ...form, compagnie_assurance: e.target.value })}
                    placeholder="Ex: NSIA, Sunu, Atlantique, Sanlam..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    N° Police / N° Sinistre
                  </label>
                  <input
                    type="text"
                    value={form.numero_sinistre}
                    onChange={(e) => setForm({ ...form, numero_sinistre: e.target.value })}
                    placeholder="Référence dossier sinistre"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Véhicule (Immatriculation) *
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
                    Client Assuré *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.client_nom}
                    onChange={(e) => setForm({ ...form, client_nom: e.target.value })}
                    placeholder="Nom de l'assuré"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Nom de l'Expert Mandaté
                  </label>
                  <input
                    type="text"
                    value={form.expert_nom}
                    onChange={(e) => setForm({ ...form, expert_nom: e.target.value })}
                    placeholder="Cabinet d'expertise"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Statut Prise en Charge
                  </label>
                  <select
                    value={form.statut_prise_en_charge}
                    onChange={(e) => setForm({ ...form, statut_prise_en_charge: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="EN_ATTENTE_ACCORD">En attente d'accord</option>
                    <option value="ACCORDE">Accordé (Accord total)</option>
                    <option value="PARTIEL">Prise en charge partielle</option>
                    <option value="REFUSE">Refusé</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Devis Soumis (FCFA)
                  </label>
                  <input
                    type="number"
                    value={form.montant_devis_soumis}
                    onChange={(e) => setForm({ ...form, montant_devis_soumis: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Accord Assurance (FCFA)
                  </label>
                  <input
                    type="number"
                    value={form.montant_accord_assurance}
                    onChange={(e) => setForm({ ...form, montant_accord_assurance: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Franchise Client (FCFA)
                  </label>
                  <input
                    type="number"
                    value={form.franchise_client}
                    onChange={(e) => setForm({ ...form, franchise_client: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Observations / Circonstances
                </label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Circonstances de l'accident, pièces d'usure contestées par l'expert..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md"
                >
                  Enregistrer le Dossier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default GarageAssurancesPage
