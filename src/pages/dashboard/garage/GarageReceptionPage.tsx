// =============================================================================
// GESTIO 229 SaaS — Réception Véhicules & Diagnostic d'Entrée
// Conforme Spécification Section 4.3
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  ClipboardCheck, Plus, Search, Printer, Check, X,
  Car, AlertTriangle, FileText, ArrowRight, Shield, Fuel,
  User, Phone, Sparkles, RefreshCw, Eye
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { GarageReception, GarageVehicule } from '../../../services/garageService'
import clsx from 'clsx'

const ACCESSOIRES_STANDARDS = [
  'Roue de secours',
  'Cric & Manivelle',
  'Clé de roue',
  'Triangle & Gilet de sécurité',
  'Extincteur',
  'Autoradio / Écran GPS',
  'Tapis de sol',
  'Enjoliveurs complets',
  'Carte grise originale',
  'Assurance en cours',
]

export const GarageReceptionPage: React.FC = () => {
  const { companyId, supabaseTenant, sectorSlug } = useTenant()
  const { toast } = useUIStore()

  const [receptions, setReceptions] = useState<GarageReception[]>([])
  const [vehicules, setVehicules] = useState<GarageVehicule[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modale Nouvelle Réception
  const [showModal, setShowModal] = useState(false)
  const [selectedVehiculeId, setSelectedVehiculeId] = useState('')
  const [form, setForm] = useState({
    immatriculation: '',
    client_nom: '',
    client_tel: '',
    km_entree: 0,
    niveau_carburant: '1/2',
    plaintes_client: '',
    symptomes_constates: '',
    dommages_visibles: '',
    receptionnaire: '',
    signature_client: '',
  })
  const [accessoiresSelectionnes, setAccessoiresSelectionnes] = useState<string[]>([
    'Roue de secours',
    'Cric & Manivelle',
    'Clé de roue',
    'Triangle & Gilet de sécurité'
  ])

  // Modale Consultation / Impression Fiche Réception
  const [printReception, setPrintReception] = useState<GarageReception | null>(null)

  const prefix = `/app/${sectorSlug || 'garage'}`

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [recRes, vehRes] = await Promise.all([
        supabaseTenant('garage_receptions').select('*').order('created_at', { ascending: false }),
        supabaseTenant('garage_clients_vehicules').select('*').order('immatriculation')
      ])

      setReceptions(recRes.data || [])
      setVehicules(vehRes.data || [])
    } catch (err: any) {
      console.warn('[GarageReception] Erreur chargement réceptions:', err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSelectVehicule = (vId: string) => {
    setSelectedVehiculeId(vId)
    const veh = vehicules.find(v => v.id === vId)
    if (veh) {
      setForm(prev => ({
        ...prev,
        immatriculation: veh.immatriculation,
        client_nom: veh.client_nom,
        client_tel: veh.client_telephone || '',
        km_entree: veh.compteur_km || 0
      }))
    }
  }

  const toggleAccessoire = (item: string) => {
    setAccessoiresSelectionnes(prev =>
      prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]
    )
  }

  const handleCreateReception = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.immatriculation.trim() || !form.client_nom.trim()) {
      toast.error('Champs requis', "Veuillez renseigner l'immatriculation et le client.")
      return
    }

    try {
      const numRec = `REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
      const payload: Partial<GarageReception> = {
        company_id: companyId || '',
        numero_reception: numRec,
        vehicule_id: selectedVehiculeId || undefined,
        immatriculation: form.immatriculation.toUpperCase().trim(),
        client_nom: form.client_nom,
        client_tel: form.client_tel,
        km_entree: form.km_entree,
        niveau_carburant: form.niveau_carburant,
        plaintes_client: form.plaintes_client,
        symptomes_constates: form.symptomes_constates,
        dommages_visibles: form.dommages_visibles,
        accessoires_remis: accessoiresSelectionnes,
        receptionnaire: form.receptionnaire || 'Chef d\'Atelier',
        statut: 'RECU'
      }

      const { error } = await supabaseTenant('garage_receptions').insert([payload])
      if (error) throw error

      // Mettre à jour le km du véhicule si existant
      if (selectedVehiculeId && form.km_entree > 0) {
        await supabaseTenant('garage_clients_vehicules')
          .update({ compteur_km: form.km_entree, updated_at: new Date().toISOString() })
          .eq('id', selectedVehiculeId)
      }

      toast.success('Réception enregistrée', `Fiche ${numRec} créée avec succès.`)
      setShowModal(false)
      loadData()
    } catch (err: any) {
      toast.error('Erreur', err.message || 'Impossible d\'enregistrer la réception.')
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const filteredReceptions = receptions.filter(r =>
    !search ||
    r.numero_reception.toLowerCase().includes(search.toLowerCase()) ||
    r.immatriculation.toLowerCase().includes(search.toLowerCase()) ||
    r.client_nom.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* ── En-tête ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-emerald-600" />
            Réceptions & Diagnostics d'Entrée
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Enregistrement des symptômes, état des lieux, niveau carburant et édition des fiches de prise en charge.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nouvelle Fiche de Réception
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
          placeholder="Rechercher une réception par N°, immatriculation ou nom du client..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
        />
      </div>

      {/* ── Liste des Réceptions ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {filteredReceptions.length === 0 ? (
          <div className="text-center py-12 p-6">
            <ClipboardCheck className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-1">Aucune réception enregistrée</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-4">
              Réceptionnez les véhicules à l'arrivée pour formaliser les demandes clients et l'état des lieux.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Créer une Réception
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">N° Réception</th>
                  <th className="py-3 px-4">Date & Heure</th>
                  <th className="py-3 px-4">Immatriculation</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">KM Entrée</th>
                  <th className="py-3 px-4">Carburant</th>
                  <th className="py-3 px-4">Plaintes & Symptômes</th>
                  <th className="py-3 px-4 text-right">Fiche</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredReceptions.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-mono font-black text-slate-900 dark:text-white">
                      {r.numero_reception}
                    </td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                      {new Date(r.date_reception).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
                        {r.immatriculation}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-800 dark:text-slate-200 font-medium">
                      {r.client_nom}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-700 dark:text-slate-300">
                      {Number(r.km_entree || 0).toLocaleString()} km
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 font-bold text-[11px] text-amber-600 dark:text-amber-400">
                        <Fuel className="w-3 h-3" />
                        {r.niveau_carburant}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                      {r.plaintes_client || r.symptomes_constates || 'Entretien courant'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setPrintReception(r)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-emerald-600 transition"
                        title="Imprimer / Voir la fiche"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Fiche</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modale Nouvelle Réception ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-3xl w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-5">
              <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-emerald-600" />
                Fiche de Réception Véhicule & Diagnostic Initial
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateReception} className="space-y-4">
              {/* Sélection Véhicule existant */}
              {vehicules.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Sélectionner un véhicule existant (optionnel)
                  </label>
                  <select
                    value={selectedVehiculeId}
                    onChange={(e) => handleSelectVehicule(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="">-- Choisir dans le parc ou saisir directement ci-dessous --</option>
                    {vehicules.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.immatriculation} — {v.marque} {v.modele} ({v.client_nom})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                    Client Déposant *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.client_nom}
                    onChange={(e) => setForm({ ...form, client_nom: e.target.value })}
                    placeholder="Nom complet"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Téléphone Client
                  </label>
                  <input
                    type="text"
                    value={form.client_tel}
                    onChange={(e) => setForm({ ...form, client_tel: e.target.value })}
                    placeholder="+229 ..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Kilométrage à l'entrée (KM)
                  </label>
                  <input
                    type="number"
                    value={form.km_entree}
                    onChange={(e) => setForm({ ...form, km_entree: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Niveau de Carburant (Jauge)
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {['Réserve', '1/4', '1/2', '3/4', 'Plein'].map((lvl) => (
                      <button
                        type="button"
                        key={lvl}
                        onClick={() => setForm({ ...form, niveau_carburant: lvl })}
                        className={clsx(
                          'py-1.5 text-center text-xs font-bold rounded-lg border transition',
                          form.niveau_carburant === lvl
                            ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                        )}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Plaintes du Client & Motifs de Dépose
                </label>
                <textarea
                  rows={2}
                  value={form.plaintes_client}
                  onChange={(e) => setForm({ ...form, plaintes_client: e.target.value })}
                  placeholder="Ex: Bruit de freinage suspect à l'avant, voyant moteur allumé..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Dommages Visibles / Égratignures / Chocs
                </label>
                <textarea
                  rows={2}
                  value={form.dommages_visibles}
                  onChange={(e) => setForm({ ...form, dommages_visibles: e.target.value })}
                  placeholder="Ex: Rayure aile avant droite, pare-choc arrière légèrement enfoncé..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              {/* Checklist d'accessoires remis */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-2">
                  Checklist des Accessoires Remis au Garage
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ACCESSOIRES_STANDARDS.map((item) => {
                    const isChecked = accessoiresSelectionnes.includes(item)
                    return (
                      <button
                        type="button"
                        key={item}
                        onClick={() => toggleAccessoire(item)}
                        className={clsx(
                          'p-2 rounded-xl text-left text-xs font-medium border flex items-center justify-between transition',
                          isChecked
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-800 dark:text-emerald-300 font-bold'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                        )}
                      >
                        <span className="truncate">{item}</span>
                        {isChecked && <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 ml-1" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition"
                >
                  Valider la Réception
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modale Impression Fiche Réception ── */}
      {printReception && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-2xl w-full bg-white text-slate-900 rounded-3xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto print:p-0 print:m-0 print:shadow-none">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4 print:hidden">
              <span className="text-xs font-bold uppercase text-slate-500">Aperçu pour Impression</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimer
                </button>
                <button
                  onClick={() => setPrintReception(null)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Document imprimable officiel */}
            <div className="p-6 border-2 border-slate-800 rounded-2xl space-y-4">
              <div className="flex justify-between items-start border-b-2 border-slate-800 pb-4">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-wider">FICHE DE RÉCEPTION VÉHICULE</h2>
                  <p className="text-xs font-mono font-bold mt-1">N° {printReception.numero_reception}</p>
                  <p className="text-xs text-slate-600">Date : {new Date(printReception.date_reception).toLocaleString('fr-FR')}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black uppercase">ATELIER & GARAGE</div>
                  <div className="text-xs text-slate-600">Prise en charge officielle</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-slate-100 rounded-xl">
                  <div className="font-bold uppercase text-slate-500 mb-1">Véhicule</div>
                  <div className="font-mono font-black text-base">{printReception.immatriculation}</div>
                  <div>Kilométrage relevé : <strong>{Number(printReception.km_entree || 0).toLocaleString()} km</strong></div>
                  <div>Niveau carburant : <strong>{printReception.niveau_carburant}</strong></div>
                </div>

                <div className="p-3 bg-slate-100 rounded-xl">
                  <div className="font-bold uppercase text-slate-500 mb-1">Client</div>
                  <div className="font-black text-sm">{printReception.client_nom}</div>
                  <div>Téléphone : {printReception.client_tel || 'Non renseigné'}</div>
                  <div>Réceptionnaire : {printReception.receptionnaire || 'Atelier'}</div>
                </div>
              </div>

              <div className="text-xs space-y-2">
                <div className="p-3 border border-slate-300 rounded-xl">
                  <div className="font-bold uppercase text-slate-600 mb-1">Motifs / Plaintes du client :</div>
                  <div className="italic">{printReception.plaintes_client || 'Entretien & contrôle mécanique'}</div>
                </div>

                {printReception.dommages_visibles && (
                  <div className="p-3 border border-slate-300 rounded-xl">
                    <div className="font-bold uppercase text-slate-600 mb-1">État des lieux / Dommages visibles constatés :</div>
                    <div className="italic">{printReception.dommages_visibles}</div>
                  </div>
                )}

                <div className="p-3 border border-slate-300 rounded-xl">
                  <div className="font-bold uppercase text-slate-600 mb-1">Accessoires présents dans le véhicule :</div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {(printReception.accessoires_remis || []).map(a => (
                      <span key={a} className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-medium text-[11px]">
                        ✓ {a}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 pt-6 border-t-2 border-slate-800 text-xs">
                <div className="text-center">
                  <p className="font-bold mb-8">Signature du Client</p>
                  <p className="text-[10px] text-slate-400">(Bon pour accord sur l'état des lieux)</p>
                </div>
                <div className="text-center">
                  <p className="font-bold mb-8">Pour l'Atelier / Réceptionnaire</p>
                  <p className="text-[10px] text-slate-400">(Tampon & Visa)</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GarageReceptionPage
