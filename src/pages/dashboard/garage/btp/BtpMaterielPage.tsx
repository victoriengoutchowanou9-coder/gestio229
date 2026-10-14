// =============================================================================
// GESTIO 229 SaaS — Parc Matériel BTP, Engins & Équipements
// Conforme Spécification Section 5.2
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Truck, Plus, Search, Edit3, Trash2, Calendar, Wrench,
  Fuel, CheckCircle2, AlertTriangle, RefreshCw, X, Shield,
  Layers, Clock, ArrowRight, Eye, Gauge
} from 'lucide-react'
import { useTenant } from '../../../../hooks/useTenant'
import { useUIStore } from '../../../../store/uiStore'
import { formatFCFA } from '../../../../utils/tax'
import { BtpMateriel, BtpSite } from '../../../../services/garageService'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

const CATEGORIES_BTP = [
  'Pelle mécanique',
  'Bulldozer',
  'Chargeuse sur pneus',
  'Tractopelle',
  'Niveleuse',
  'Compacteur',
  'Camion-benne',
  'Tracteur routier',
  'Camion-toupie',
  'Grue mobile',
  'Chariot élévateur',
  'Groupe électrogène',
  'Compresseur d\'air',
  'Bétonnière',
  'Véhicule de liaison / Pick-up'
]

export const BtpMaterielPage: React.FC = () => {
  const { companyId, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  const [materiels, setMateriels] = useState<BtpMateriel[]>([])
  const [sites, setSites] = useState<BtpSite[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('TOUS')
  const [filterStatut, setFilterStatut] = useState('TOUS')

  // Modale Nouveau / Modifier Matériel
  const [showModal, setShowModal] = useState(false)
  const [editingMat, setEditingMat] = useState<BtpMateriel | null>(null)
  const [form, setForm] = useState({
    code_materiel: '',
    designation: '',
    categorie: 'Pelle mécanique',
    marque: '',
    modele: '',
    annee: new Date().getFullYear(),
    numero_serie: '',
    immatriculation: '',
    site_actuel_id: '',
    site_nom: '',
    type_compteur: 'HEURES_MOTEUR',
    compteur_heures_actuel: 0,
    compteur_km_actuel: 0,
    statut: 'DISPONIBLE',
    cout_acquisition: 0,
    capacite_carburant_reservoir: 250,
    conso_theorique_moyenne: 20,
    compteur_prochaine_maintenance: 250,
    conducteur_habituel_nom: '',
    notes: '',
  })

  // Modale Relevé de Compteur Rapide
  const [releveModal, setReleveModal] = useState<BtpMateriel | null>(null)
  const [releveForm, setReleveForm] = useState({
    heures: 0,
    km: 0,
    contexte: 'ROUTINE',
    notes: ''
  })

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [matRes, siteRes] = await Promise.all([
        supabaseTenant('btp_materiels').select('*').order('code_materiel'),
        supabaseTenant('btp_sites').select('*').order('nom_site')
      ])

      setMateriels(matRes.data || [])
      setSites(siteRes.data || [])
    } catch (err: any) {
      console.warn('[BtpMateriel] Erreur chargement:', err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadData()
  }, [loadData])

  const openCreateModal = () => {
    setEditingMat(null)
    setForm({
      code_materiel: `ENG-${Math.floor(100 + Math.random() * 900)}`,
      designation: '',
      categorie: 'Pelle mécanique',
      marque: '',
      modele: '',
      annee: new Date().getFullYear(),
      numero_serie: '',
      immatriculation: '',
      site_actuel_id: sites[0]?.id || '',
      site_nom: sites[0]?.nom_site || '',
      type_compteur: 'HEURES_MOTEUR',
      compteur_heures_actuel: 0,
      compteur_km_actuel: 0,
      statut: 'DISPONIBLE',
      cout_acquisition: 0,
      capacite_carburant_reservoir: 250,
      conso_theorique_moyenne: 20,
      compteur_prochaine_maintenance: 250,
      conducteur_habituel_nom: '',
      notes: '',
    })
    setShowModal(true)
  }

  const openEditModal = (m: BtpMateriel) => {
    setEditingMat(m)
    setForm({
      code_materiel: m.code_materiel,
      designation: m.designation,
      categorie: m.categorie,
      marque: m.marque,
      modele: m.modele,
      annee: m.annee || new Date().getFullYear(),
      numero_serie: m.numero_serie || '',
      immatriculation: m.immatriculation || '',
      site_actuel_id: m.site_actuel_id || '',
      site_nom: m.site_nom || '',
      type_compteur: m.type_compteur,
      compteur_heures_actuel: m.compteur_heures_actuel || 0,
      compteur_km_actuel: m.compteur_km_actuel || 0,
      statut: m.statut,
      cout_acquisition: m.cout_acquisition || 0,
      capacite_carburant_reservoir: m.capacite_carburant_reservoir || 250,
      conso_theorique_moyenne: m.conso_theorique_moyenne || 20,
      compteur_prochaine_maintenance: m.compteur_prochaine_maintenance || 250,
      conducteur_habituel_nom: m.conducteur_habituel_nom || '',
      notes: m.notes || '',
    })
    setShowModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.code_materiel.trim() || !form.designation.trim() || !form.marque.trim()) {
      toast.error('Champs requis', 'Veuillez remplir le code, la désignation et la marque.')
      return
    }

    try {
      const siteObj = sites.find(s => s.id === form.site_actuel_id)
      const payload: Partial<BtpMateriel> = {
        company_id: companyId || '',
        ...form,
        site_nom: siteObj ? siteObj.nom_site : form.site_nom
      }

      if (editingMat) {
        const { error } = await supabaseTenant('btp_materiels')
          .update(payload)
          .eq('id', editingMat.id)
        if (error) throw error
        toast.success('Matériel mis à jour', `La fiche ${form.code_materiel} a été actualisée.`)
      } else {
        const { error } = await supabaseTenant('btp_materiels').insert([payload])
        if (error) throw error
        toast.success('Matériel créé', `Le matériel ${form.code_materiel} est ajouté au parc BTP.`)
      }
      setShowModal(false)
      loadData()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    }
  }

  const handleDelete = async (m: BtpMateriel) => {
    if (!window.confirm(`Supprimer définitivement l'engin ${m.code_materiel} (${m.designation}) ?`)) return
    try {
      const { error } = await supabaseTenant('btp_materiels').delete().eq('id', m.id)
      if (error) throw error
      toast.success('Suppression effectuée', `L'engin ${m.code_materiel} a été retiré.`)
      loadData()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    }
  }

  // Enregistrement rapide d'un relevé de compteur
  const handleSaveReleve = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!releveModal) return

    try {
      // 1. Enregistrer le relevé dans btp_compteurs_releves
      await supabaseTenant('btp_compteurs_releves').insert([{
        company_id: companyId,
        materiel_id: releveModal.id,
        heures_moteur: releveForm.heures,
        kilometrage: releveForm.km,
        contexte: releveForm.contexte,
        notes: releveForm.notes
      }])

      // 2. Mettre à jour les compteurs sur le matériel
      await supabaseTenant('btp_materiels')
        .update({
          compteur_heures_actuel: releveForm.heures,
          compteur_km_actuel: releveForm.km,
          compteur_derniere_maj: new Date().toISOString()
        })
        .eq('id', releveModal.id)

      toast.success('Compteur mis à jour', `Nouveau relevé enregistré pour ${releveModal.code_materiel}.`)
      setReleveModal(null)
      loadData()
    } catch (err: any) {
      toast.error('Erreur relevé', err.message)
    }
  }

  const filteredMateriels = useMemo(() => {
    return materiels.filter(m => {
      const matchesSearch =
        !search ||
        m.code_materiel.toLowerCase().includes(search.toLowerCase()) ||
        m.designation.toLowerCase().includes(search.toLowerCase()) ||
        m.marque.toLowerCase().includes(search.toLowerCase()) ||
        m.modele.toLowerCase().includes(search.toLowerCase()) ||
        (m.immatriculation && m.immatriculation.toLowerCase().includes(search.toLowerCase()))

      const matchesCat = filterCat === 'TOUS' || m.categorie === filterCat
      const matchesStatut = filterStatut === 'TOUS' || m.statut === filterStatut
      return matchesSearch && matchesCat && matchesStatut
    })
  }, [materiels, search, filterCat, filterStatut])

  const getStatutBadge = (st: string) => {
    switch (st) {
      case 'DISPONIBLE':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">Disponible</span>
      case 'AFFECTE_CHANTIER':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">Sur Chantier</span>
      case 'EN_MAINTENANCE':
      case 'EN_PANNE':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">En Réparation</span>
      case 'IMMOBILISE':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">Immobilisé</span>
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">{st}</span>
    }
  }

  return (
    <div className="space-y-6">
      {/* ── En-tête ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Truck className="w-6 h-6 text-amber-600" />
            Parc Matériel BTP & Équipements
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Fiches engins, compteurs d'heures et kilométriques, affectation multisite et suivi TCO.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md shadow-amber-600/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nouveau Matériel / Engin
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

      {/* ── Recherche & Filtres ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par code, désignation, marque, modèle ou immatriculation..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          />
        </div>

        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="px-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
        >
          <option value="TOUS">Toutes catégories</option>
          {CATEGORIES_BTP.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={filterStatut}
          onChange={(e) => setFilterStatut(e.target.value)}
          className="px-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
        >
          <option value="TOUS">Tous statuts</option>
          <option value="DISPONIBLE">Disponible</option>
          <option value="AFFECTE_CHANTIER">Sur Chantier</option>
          <option value="EN_MAINTENANCE">En Maintenance</option>
          <option value="EN_PANNE">En Panne</option>
          <option value="IMMOBILISE">Immobilisé</option>
        </select>
      </div>

      {/* ── Liste du Parc Matériel ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {filteredMateriels.length === 0 ? (
          <div className="text-center py-12 p-6">
            <Truck className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-1">Aucun matériel répertorié</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-4">
              Enregistrez vos camions, pelles, compacteurs et groupes électrogènes pour démarrer la gestion BTP.
            </p>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 text-white font-bold text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Ajouter un Matériel
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Désignation & Catégorie</th>
                  <th className="py-3 px-4">Marque / Modèle</th>
                  <th className="py-3 px-4">Compteur Actuel</th>
                  <th className="py-3 px-4">Prochain Entretien</th>
                  <th className="py-3 px-4">Site / Chantier</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredMateriels.map((m) => {
                  const currentCompteur = m.type_compteur === 'HEURES_MOTEUR' ? m.compteur_heures_actuel : m.compteur_km_actuel
                  const isMaintenanceDue = m.compteur_prochaine_maintenance && currentCompteur >= m.compteur_prochaine_maintenance

                  return (
                    <tr key={m.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-mono font-black text-amber-700 dark:text-amber-400 text-sm">
                        {m.code_materiel}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">{m.designation}</div>
                        <div className="text-[10px] text-slate-500">{m.categorie}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-800 dark:text-slate-200">
                        <div>{m.marque} {m.modele}</div>
                        {m.immatriculation && <div className="text-[10px] font-mono text-slate-400">{m.immatriculation}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => {
                            setReleveModal(m)
                            setReleveForm({
                              heures: m.compteur_heures_actuel || 0,
                              km: m.compteur_km_actuel || 0,
                              contexte: 'ROUTINE',
                              notes: ''
                            })
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-slate-200 dark:border-slate-700 font-mono font-bold text-slate-800 dark:text-slate-200 transition cursor-pointer"
                          title="Cliquer pour mettre à jour le compteur"
                        >
                          <Gauge className="w-3.5 h-3.5 text-amber-600" />
                          <span>
                            {m.type_compteur === 'HEURES_MOTEUR'
                              ? `${Number(m.compteur_heures_actuel || 0).toLocaleString()} h`
                              : `${Number(m.compteur_km_actuel || 0).toLocaleString()} km`}
                          </span>
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        {m.compteur_prochaine_maintenance ? (
                          <div className={clsx('font-bold', isMaintenanceDue ? 'text-rose-600 flex items-center gap-1' : 'text-slate-600 dark:text-slate-400')}>
                            <span>{m.compteur_prochaine_maintenance} {m.type_compteur === 'HEURES_MOTEUR' ? 'h' : 'km'}</span>
                            {isMaintenanceDue && <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-medium">
                        {m.site_nom || 'Base Centrale'}
                      </td>
                      <td className="py-3 px-4">
                        {getStatutBadge(m.statut)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditModal(m)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-slate-800 transition"
                            title="Modifier"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(m)}
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

      {/* ── Modale Formulaire Matériel BTP ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-3xl w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-5">
              <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <Truck className="w-5 h-5 text-amber-600" />
                {editingMat ? 'Modifier Matériel BTP' : 'Ajouter un Matériel au Parc BTP'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Code Matériel / Numéro Unique *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.code_materiel}
                    onChange={(e) => setForm({ ...form, code_materiel: e.target.value.toUpperCase() })}
                    placeholder="Ex: PEL-01, CAM-05..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Désignation du Matériel *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.designation}
                    onChange={(e) => setForm({ ...form, designation: e.target.value })}
                    placeholder="Ex: Pelle sur chenilles 22T avec godet 1.2m³"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Catégorie d'Engin *
                  </label>
                  <select
                    value={form.categorie}
                    onChange={(e) => setForm({ ...form, categorie: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  >
                    {CATEGORIES_BTP.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Marque Constructeur *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.marque}
                    onChange={(e) => setForm({ ...form, marque: e.target.value })}
                    placeholder="Caterpillar, Komatsu, Volvo, Scania..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Modèle / Type
                  </label>
                  <input
                    type="text"
                    value={form.modele}
                    onChange={(e) => setForm({ ...form, modele: e.target.value })}
                    placeholder="Ex: 320D, D6R, FH500..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Type de Compteur
                  </label>
                  <select
                    value={form.type_compteur}
                    onChange={(e) => setForm({ ...form, type_compteur: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value="HEURES_MOTEUR">Heures Moteur (Engins/Groupes)</option>
                    <option value="KILOMETRAGE">Kilométrage (Camions/Véhicules)</option>
                    <option value="LES_DEUX">Les deux (Heures + KM)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Compteur Heures Actuel
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.compteur_heures_actuel}
                    onChange={(e) => setForm({ ...form, compteur_heures_actuel: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Compteur KM Actuel
                  </label>
                  <input
                    type="number"
                    value={form.compteur_km_actuel}
                    onChange={(e) => setForm({ ...form, compteur_km_actuel: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Site / Chantier Actuel
                  </label>
                  <select
                    value={form.site_actuel_id}
                    onChange={(e) => setForm({ ...form, site_actuel_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="">Base Centrale</option>
                    {sites.map(s => (
                      <option key={s.id} value={s.id}>{s.nom_site} ({s.type_site})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Statut Opérationnel
                  </label>
                  <select
                    value={form.statut}
                    onChange={(e) => setForm({ ...form, statut: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="DISPONIBLE">Disponible</option>
                    <option value="AFFECTE_CHANTIER">Sur Chantier</option>
                    <option value="EN_MAINTENANCE">En Maintenance</option>
                    <option value="EN_PANNE">En Panne</option>
                    <option value="IMMOBILISE">Immobilisé</option>
                    <option value="REFORME">Réformé</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Prochain Entretien (Seuil)
                  </label>
                  <input
                    type="number"
                    value={form.compteur_prochaine_maintenance}
                    onChange={(e) => setForm({ ...form, compteur_prochaine_maintenance: Number(e.target.value) })}
                    placeholder="Ex: 250h ou 10000km"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
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
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md"
                >
                  {editingMat ? 'Mettre à jour' : 'Enregistrer le Matériel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modale Relevé Rapide de Compteur ── */}
      {releveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Gauge className="w-5 h-5 text-amber-600" />
                Nouveau Relevé : {releveModal.code_materiel}
              </h3>
              <button onClick={() => setReleveModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveReleve} className="space-y-4">
              <p className="text-xs text-slate-500">
                Saisissez le nouveau compteur lu sur le tableau de bord de l'engin pour mettre à jour son état et planifier la maintenance.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Compteur Heures Moteur
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={releveForm.heures}
                  onChange={(e) => setReleveForm({ ...releveForm, heures: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Compteur Kilométrique (si applicable)
                </label>
                <input
                  type="number"
                  value={releveForm.km}
                  onChange={(e) => setReleveForm({ ...releveForm, km: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Contexte du Relevé
                </label>
                <select
                  value={releveForm.contexte}
                  onChange={(e) => setReleveForm({ ...releveForm, contexte: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                >
                  <option value="ROUTINE">Relevé quotidien / Routine</option>
                  <option value="DEPART_CHANTIER">Départ vers Chantier</option>
                  <option value="RETOUR_CHANTIER">Retour de Chantier</option>
                  <option value="PLEIN_CARBURANT">Pendant le plein de carburant</option>
                  <option value="MAINTENANCE">Après intervention de maintenance</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setReleveModal(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md"
                >
                  Enregistrer le Relevé
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default BtpMaterielPage
