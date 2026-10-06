// =============================================================================
// GESTIO 229 SaaS — Module Devis & Production Imprimerie / Sérigraphie
// Devis Chiffrés au m² / Forfaits, Transformation en Commande, File Graphiste,
// Atelier de Tirage & Consommation Réelle, Encaissement Acomptes / Soldes
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FileText, ShoppingBag, Plus, RefreshCw, Printer, CheckCircle2,
  Clock, AlertTriangle, ArrowRight, DollarSign, Layers, UserCheck,
  Search, Eye, Scissors, X, Save, Edit3, Trash2, ShieldAlert,
  Sliders, Calendar, Phone, Check, AlertOctagon, Download
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import {
  imprimerieService,
  DevisImprimerie,
  CommandeImprimerie,
  PrestationImprimerie,
  MatierePremiere,
  DevisLigne,
  StatutCommande,
  PrioriteCommande
} from '../../../services/imprimerieService'
import { supabase } from '../../../lib/supabase'

export const ImprimerieDevisProductionPage: React.FC = () => {
  const { companyId, sectorSlug } = useTenant()
  const { company, user } = useAuthStore()
  const { toast } = useUIStore() as any

  const activeSector = sectorSlug || 'imprimerie'

  // Onglet actif : 'commandes' | 'devis' | 'graphiste' | 'atelier'
  const [activeTab, setActiveTab] = useState<'commandes' | 'devis' | 'graphiste' | 'atelier'>('commandes')

  const [loading, setLoading] = useState(true)
  const [commandes, setCommandes] = useState<CommandeImprimerie[]>([])
  const [devisList, setDevisList] = useState<DevisImprimerie[]>([])
  const [prestations, setPrestations] = useState<PrestationImprimerie[]>([])
  const [matieres, setMatieres] = useState<MatierePremiere[]>([])
  const [clients, setClients] = useState<any[]>([])

  // Filtres
  const [search, setSearch] = useState('')
  const [statutFilter, setStatutFilter] = useState('TOUS')

  // Modals
  const [showDevisModal, setShowDevisModal] = useState(false)
  const [showEncaissementModal, setShowEncaissementModal] = useState(false)
  const [showConsommationModal, setShowConsommationModal] = useState(false)
  const [showDetailCommandeModal, setShowDetailCommandeModal] = useState(false)
  const [selectedCommande, setSelectedCommande] = useState<CommandeImprimerie | null>(null)

  // Formulaire Devis
  const [devisForm, setDevisForm] = useState<{
    client_id: string
    client_nom: string
    client_tel: string
    date_validite: string
    notes: string
    lignes: DevisLigne[]
  }>({
    client_id: '',
    client_nom: '',
    client_tel: '',
    date_validite: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
    notes: '',
    lignes: [],
  })

  // Formulaire Encaissement
  const [paiementForm, setPaiementForm] = useState<{
    montant: number
    mode_paiement: 'especes' | 'momo_mtn' | 'momo_moov' | 'banque' | 'cheque' | 'credit'
    type_paiement: 'acompte' | 'solde' | 'partiel'
    notes: string
  }>({
    montant: 0,
    mode_paiement: 'especes',
    type_paiement: 'acompte',
    notes: '',
  })

  // Formulaire Consommation Réelle
  const [consoForm, setConsoForm] = useState<{
    matiere_id: string
    quantite_reelle: number
    quantite_prevue: number
    motif_perte: 'chute' | 'erreur_impression' | 'defaut_matiere' | 'mauvaise_manipulation' | 'reimpression' | 'autre'
    est_reimpression: boolean
    notes: string
  }>({
    matiere_id: '',
    quantite_reelle: 1,
    quantite_prevue: 1,
    motif_perte: 'chute',
    est_reimpression: false,
    notes: '',
  })

  const notify = (type: 'success' | 'error', msg: string) => {
    try {
      if (toast?.[type]) toast[type](msg)
      else if (typeof toast === 'function') toast(msg, type)
      else window.alert(msg)
    } catch {
      window.alert(msg)
    }
  }

  const loadAll = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [cmds, devs, pres, mats, cls] = await Promise.all([
        imprimerieService.getCommandes(companyId, activeSector),
        imprimerieService.getDevis(companyId, activeSector),
        imprimerieService.getPrestations(companyId, activeSector),
        imprimerieService.getMatieres(companyId, activeSector),
        supabase.from('customers').select('id, name, phone').eq('company_id', companyId).order('name'),
      ])
      setCommandes(cmds)
      setDevisList(devs)
      setPrestations(pres)
      setMatieres(mats)
      setClients(cls.data || [])
    } catch (err: any) {
      console.error('Erreur chargement devis/production:', err)
      notify('error', 'Erreur chargement des données.')
    } finally {
      setLoading(false)
    }
  }, [companyId, activeSector])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // ── Ajout ligne devis ──
  const handleAddDevisLigne = (prestationId?: string) => {
    const pres = prestations.find((p) => p.id === prestationId)
    const newLigne: DevisLigne = {
      prestation_id: pres?.id,
      designation: pres ? pres.nom : 'Travail sur mesure',
      mode_calcul: pres ? pres.mode_calcul : 'm2',
      largeur: 1,
      hauteur: 1,
      surface_m2: 1,
      quantite: 1,
      prix_unitaire: pres ? pres.prix_vente : 2000,
      remise_pct: 0,
      montant_ht: pres ? pres.prix_vente : 2000,
      tva_pct: 0,
      montant_ttc: pres ? pres.prix_vente : 2000,
    }
    setDevisForm((prev) => ({
      ...prev,
      lignes: [...prev.lignes, newLigne],
    }))
  }

  const handleUpdateDevisLigne = (index: number, field: string, val: any) => {
    setDevisForm((prev) => {
      const updated = [...prev.lignes]
      const current = { ...updated[index], [field]: val }

      // Recalcul surface si dimensions changent
      if (field === 'largeur' || field === 'hauteur') {
        const l = field === 'largeur' ? Number(val) : Number(current.largeur)
        const h = field === 'hauteur' ? Number(val) : Number(current.hauteur)
        current.surface_m2 = Number((l * h).toFixed(3))
      }

      // Recalcul prix total ligne
      const surface = Number(current.surface_m2 || 1)
      const qty = Number(current.quantite || 1)
      const pu = Number(current.prix_unitaire || 0)
      const remise = Number(current.remise_pct || 0)
      const tva = Number(current.tva_pct || 0)

      const base = current.mode_calcul === 'm2' ? surface * qty * pu : qty * pu
      const ht = base * (1 - remise / 100)
      const ttc = ht * (1 + tva / 100)

      current.montant_ht = Math.round(ht)
      current.montant_ttc = Math.round(ttc)
      updated[index] = current

      return { ...prev, lignes: updated }
    })
  }

  const handleRemoveDevisLigne = (index: number) => {
    setDevisForm((prev) => ({
      ...prev,
      lignes: prev.lignes.filter((_, i) => i !== index),
    }))
  }

  // ── Sauvegarde Devis ──
  const handleSaveDevis = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId) return
    if (!devisForm.client_nom) {
      notify('error', 'Veuillez saisir le nom du client.')
      return
    }
    if (devisForm.lignes.length === 0) {
      notify('error', 'Veuillez ajouter au moins une prestation dans le devis.')
      return
    }

    try {
      await imprimerieService.saveDevis(
        {
          company_id: companyId,
          sector_slug: activeSector,
          client_id: devisForm.client_id || undefined,
          client_nom: devisForm.client_nom,
          client_tel: devisForm.client_tel,
          date_validite: devisForm.date_validite,
          notes: devisForm.notes,
          commercial_nom: user?.full_name || 'Commercial',
        },
        devisForm.lignes
      )
      notify('success', 'Devis enregistré avec succès !')
      setShowDevisModal(false)
      loadAll()
    } catch (err: any) {
      notify('error', err.message || 'Erreur enregistrement devis.')
    }
  }

  // ── Transformation Devis ➔ Commande ──
  const handleTransformerDevis = async (devisId: string) => {
    if (!window.confirm('Voulez-vous transformer ce devis en commande de production ferme ?')) return
    try {
      const cmd = await imprimerieService.transformerDevisEnCommande(devisId, user)
      notify('success', `Commande N° ${cmd.numero_commande} créée avec succès et envoyée à l'atelier !`)
      loadAll()
      setActiveTab('commandes')
    } catch (err: any) {
      notify('error', err.message || 'Erreur transformation devis.')
    }
  }

  // ── Changement de statut de commande ──
  const handleChangeStatus = async (cmdId: string, newStatus: StatutCommande) => {
    try {
      await imprimerieService.updateCommandeStatus(cmdId, newStatus, user)
      notify('success', `Statut mis à jour : ${newStatus.replace(/_/g, ' ')}`)
      loadAll()
      if (selectedCommande?.id === cmdId) {
        setSelectedCommande((prev) => (prev ? { ...prev, statut: newStatus } : null))
      }
    } catch (err: any) {
      notify('error', err.message || 'Erreur mise à jour statut.')
    }
  }

  // ── Encaissement Commande ──
  const handleValiderEncaissement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCommande || !companyId) return
    if (paiementForm.montant <= 0) {
      notify('error', 'Veuillez saisir un montant supérieur à 0.')
      return
    }

    try {
      await imprimerieService.enregistrerPaiement(
        {
          company_id: companyId,
          sector_slug: activeSector,
          commande_id: selectedCommande.id,
          montant: paiementForm.montant,
          mode_paiement: paiementForm.mode_paiement,
          reference_recu: `REC-${Date.now().toString().slice(-6)}`,
          type_paiement: paiementForm.type_paiement,
          notes: paiementForm.notes,
        },
        user
      )
      notify('success', `Encaissement de ${paiementForm.montant.toLocaleString('fr-FR')} F validé !`)
      setShowEncaissementModal(false)
      loadAll()
    } catch (err: any) {
      notify('error', err.message || 'Erreur encaissement.')
    }
  }

  // ── Consommation Réelle & Pertes/Chutes ──
  const handleValiderConsommation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCommande || !consoForm.matiere_id) {
      notify('error', 'Veuillez sélectionner une matière première.')
      return
    }

    try {
      await imprimerieService.enregistrerConsommationReelle(
        selectedCommande.id,
        consoForm.matiere_id,
        consoForm.quantite_reelle,
        consoForm.motif_perte,
        consoForm.est_reimpression,
        consoForm.quantite_prevue,
        consoForm.notes,
        user
      )
      notify('success', 'Consommation réelle et perte enregistrées ! Stock et coût actualisés.')
      setShowConsommationModal(false)
      loadAll()
    } catch (err: any) {
      notify('error', err.message || 'Erreur saisie consommation.')
    }
  }

  // Filtre commandes
  const filteredCommandes = useMemo(() => {
    return commandes.filter((c) => {
      const matchSearch =
        c.numero_commande.toLowerCase().includes(search.toLowerCase()) ||
        c.client_nom.toLowerCase().includes(search.toLowerCase()) ||
        c.titre_travail.toLowerCase().includes(search.toLowerCase())
      if (!matchSearch) return false

      if (statutFilter === 'TOUS') return true
      if (statutFilter === 'EN_PRODUCTION') {
        return ['a_concevoir', 'maquette_attente', 'maquette_validee', 'en_production', 'en_impression', 'en_finition'].includes(c.statut)
      }
      if (statutFilter === 'TERMINE') return c.statut === 'termine'
      if (statutFilter === 'LIVRE') return c.statut === 'livre'
      if (statutFilter === 'IMPAYES') return c.solde_restant > 0
      return c.statut === statutFilter
    })
  }, [commandes, search, statutFilter])

  // File graphiste
  const fileGraphiste = useMemo(() => {
    return commandes.filter((c) => ['a_concevoir', 'maquette_attente', 'maquette_validee'].includes(c.statut))
  }, [commandes])

  return (
    <div className="space-y-6 pb-16 animate-fadeIn">
      {/* ── Entête & Navigation Onglets ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 flex items-center gap-2">
            <Printer className="w-6 h-6 text-pink-600" /> Devis, Atelier & Production
          </h1>
          <p className="text-xs text-slate-500">
            Chiffrage précis au m², ordonnancement atelier, file graphiste et consommation réelle des matières
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadAll}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-pink-600' : ''}`} />
          </button>

          <button
            onClick={() => {
              setDevisForm({
                client_id: '',
                client_nom: '',
                client_tel: '',
                date_validite: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
                notes: '',
                lignes: [],
              })
              handleAddDevisLigne()
              setShowDevisModal(true)
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl text-xs shadow-sm transition"
          >
            <Plus className="w-4 h-4" /> Nouveau Devis Imprimerie
          </button>
        </div>
      </div>

      {/* ── Onglets Métiers ── */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto text-xs font-bold">
        <button
          onClick={() => setActiveTab('commandes')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
            activeTab === 'commandes'
              ? 'bg-pink-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShoppingBag className="w-4 h-4" /> Commandes & Atelier ({commandes.length})
        </button>

        <button
          onClick={() => setActiveTab('devis')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
            activeTab === 'devis'
              ? 'bg-pink-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4" /> Devis & Offres ({devisList.length})
        </button>

        <button
          onClick={() => setActiveTab('graphiste')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
            activeTab === 'graphiste'
              ? 'bg-pink-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <UserCheck className="w-4 h-4" /> File Graphiste ({fileGraphiste.length})
        </button>
      </div>

      {/* ── VUE 1 : COMMANDES & PRODUCTION EN ATELIER ── */}
      {activeTab === 'commandes' && (
        <div className="space-y-4">
          {/* Barre de recherche et filtres */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher par N° commande, client, titre..."
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none"
              />
            </div>

            <select
              value={statutFilter}
              onChange={(e) => setStatutFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-pink-500 focus:outline-none"
            >
              <option value="TOUS">Tous les statuts</option>
              <option value="EN_PRODUCTION">En production / Atelier</option>
              <option value="TERMINE">Terminées (prêtes)</option>
              <option value="LIVRE">Livrées</option>
              <option value="IMPAYES">Créances non soldées</option>
            </select>
          </div>

          {/* Liste des commandes */}
          {filteredCommandes.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 text-slate-400 text-xs">
              Aucune commande trouvée.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCommandes.map((cmd) => {
                const solde = Number(cmd.solde_restant || 0)
                const isUrgent = cmd.priorite !== 'normale'
                return (
                  <div
                    key={cmd.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-pink-300 transition-all p-4 flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-black text-slate-900 text-xs">{cmd.numero_commande}</span>
                        <div className="flex items-center gap-1.5">
                          {isUrgent && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 animate-pulse">
                              {cmd.priorite}
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            cmd.statut === 'termine'
                              ? 'bg-emerald-100 text-emerald-800'
                              : cmd.statut === 'livre'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-pink-100 text-pink-800'
                          }`}>
                            {cmd.statut.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </div>

                      <h3 className="font-bold text-slate-800 text-sm mt-2 leading-tight">
                        {cmd.titre_travail}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-slate-400" />
                        {cmd.client_nom} {cmd.client_tel ? `(${cmd.client_tel})` : ''}
                      </p>

                      {/* Indicateurs financiers */}
                      <div className="mt-3 p-2.5 bg-slate-50 rounded-xl space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Montant Total TTC :</span>
                          <span className="font-black text-slate-900">{cmd.total_ttc.toLocaleString('fr-FR')} F</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Payé :</span>
                          <span className="font-bold text-emerald-600">{cmd.montant_paye.toLocaleString('fr-FR')} F</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-200 pt-1">
                          <span className="text-slate-500">Reste à payer :</span>
                          <span className={`font-black ${solde > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                            {solde > 0 ? `${solde.toLocaleString('fr-FR')} F` : 'Soldé ✓'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions d'Atelier */}
                    <div className="border-t border-slate-100 pt-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {/* Sélecteur de statut */}
                        <select
                          value={cmd.statut}
                          onChange={(e) => handleChangeStatus(cmd.id, e.target.value as StatutCommande)}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-[11px] font-bold focus:outline-none"
                        >
                          <option value="devis_accepte">Devis accepté</option>
                          <option value="a_concevoir">À concevoir (Graphiste)</option>
                          <option value="maquette_attente">Maquette en attente</option>
                          <option value="maquette_validee">Maquette validée B.A.T.</option>
                          <option value="en_production">En production</option>
                          <option value="en_impression">En impression (Machine)</option>
                          <option value="en_finition">En finition</option>
                          <option value="termine">Terminé (Prêt)</option>
                          <option value="livre">Livré au client</option>
                          <option value="annule">Annulé</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-1">
                        {/* Bouton Consommation réelle */}
                        <button
                          onClick={() => {
                            setSelectedCommande(cmd)
                            setConsoForm({
                              matiere_id: matieres[0]?.id || '',
                              quantite_reelle: 1,
                              quantite_prevue: 1,
                              motif_perte: 'chute',
                              est_reimpression: false,
                              notes: '',
                            })
                            setShowConsommationModal(true)
                          }}
                          className="p-1.5 text-slate-600 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition"
                          title="Saisir consommation réelle / Pertes & Chutes"
                        >
                          <Scissors className="w-4 h-4" />
                        </button>

                        {/* Bouton Encaissement Caissière */}
                        <button
                          onClick={() => {
                            setSelectedCommande(cmd)
                            setPaiementForm({
                              montant: solde > 0 ? solde : 0,
                              mode_paiement: 'especes',
                              type_paiement: solde === Number(cmd.total_ttc) ? 'acompte' : 'solde',
                              notes: '',
                            })
                            setShowEncaissementModal(true)
                          }}
                          className={`px-2.5 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1 ${
                            solde > 0
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                          title="Encaisser acompte ou solde"
                        >
                          <DollarSign className="w-3.5 h-3.5" /> Encaisser
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── VUE 2 : DEVIS & OFFRES CLIENTS ── */}
      {activeTab === 'devis' && (
        <div className="space-y-4">
          {devisList.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 text-slate-400 text-xs">
              Aucun devis créé pour l'instant.
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                  <tr>
                    <th className="text-left px-4 py-3">N° Devis</th>
                    <th className="text-left px-4 py-3">Client</th>
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-left px-4 py-3">Validité</th>
                    <th className="text-right px-4 py-3">Total HT</th>
                    <th className="text-right px-4 py-3">Total TTC</th>
                    <th className="text-center px-4 py-3">Statut</th>
                    <th className="text-center px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {devisList.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">{d.numero_devis}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {d.client_nom}
                        {d.client_tel && <span className="text-[10px] text-slate-400 block">{d.client_tel}</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{d.date_devis}</td>
                      <td className="px-4 py-3 text-slate-600">{d.date_validite}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-700">{d.total_ht.toLocaleString('fr-FR')} F</td>
                      <td className="px-4 py-3 text-right font-black text-slate-900">{d.total_ttc.toLocaleString('fr-FR')} F</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          d.statut === 'transforme'
                            ? 'bg-emerald-100 text-emerald-800'
                            : d.statut === 'accepte'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {d.statut.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {d.statut !== 'transforme' ? (
                          <button
                            onClick={() => handleTransformerDevis(d.id)}
                            className="px-3 py-1 bg-pink-600 hover:bg-pink-700 text-white rounded-lg font-bold text-[11px] shadow-xs transition"
                          >
                            Transformer en Commande
                          </button>
                        ) : (
                          <span className="text-emerald-600 font-bold text-[11px]">En Production ✓</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── VUE 3 : FILE GRAPHISTE (B.A.T. & VALIDATION MAQUETTE) ── */}
      {activeTab === 'graphiste' && (
        <div className="space-y-4">
          <div className="p-4 bg-pink-50 rounded-2xl border border-pink-200 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-pink-900">
              <UserCheck className="w-5 h-5 text-pink-600 shrink-0" />
              <span>
                <strong>Espace Conception PAO :</strong> Le graphiste valide les fichiers, prépare les B.A.T. et passe les dossiers en production après validation client.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {fileGraphiste.map((cmd) => (
              <div key={cmd.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-900 text-xs">{cmd.numero_commande}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-50 text-pink-700">
                    {cmd.statut.replace(/_/g, ' ')}
                  </span>
                </div>

                <h3 className="font-bold text-slate-800 text-sm">{cmd.titre_travail}</h3>
                <p className="text-xs text-slate-500">Client : {cmd.client_nom}</p>

                {cmd.instructions_graphiste && (
                  <div className="p-2.5 bg-slate-50 rounded-xl text-slate-700 text-xs italic">
                    « {cmd.instructions_graphiste} »
                  </div>
                )}

                <div className="border-t border-slate-100 pt-2 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleChangeStatus(cmd.id, 'maquette_attente')}
                    className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded-lg text-xs"
                  >
                    B.A.T. Envoyé
                  </button>

                  <button
                    onClick={() => handleChangeStatus(cmd.id, 'en_production')}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 shadow-xs"
                  >
                    <Check className="w-3.5 h-3.5" /> B.A.T. Validé ➔ Atelier
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODAL CRÉATION DEVIS PRO AU M² ── */}
      {showDevisModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 space-y-5 my-8 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">Nouveau Devis Imprimerie & Sérigraphie</h3>
                <p className="text-xs text-slate-500">Calculette surfaces m², formats papier, finitions et remises</p>
              </div>
              <button onClick={() => setShowDevisModal(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDevis} className="space-y-4">
              {/* Infos Client */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">Client *</label>
                  <input
                    type="text"
                    required
                    value={devisForm.client_nom}
                    onChange={(e) => setDevisForm((p) => ({ ...p, client_nom: e.target.value }))}
                    placeholder="Nom du client / Société"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">Téléphone</label>
                  <input
                    type="text"
                    value={devisForm.client_tel}
                    onChange={(e) => setDevisForm((p) => ({ ...p, client_tel: e.target.value }))}
                    placeholder="Ex: +229 97 00 00 00"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">Validité jusqu'au</label>
                  <input
                    type="date"
                    value={devisForm.date_validite}
                    onChange={(e) => setDevisForm((p) => ({ ...p, date_validite: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Lignes du Devis */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 uppercase">Prestations & Travaux</span>
                  <button
                    type="button"
                    onClick={() => handleAddDevisLigne()}
                    className="text-xs font-bold text-pink-600 hover:text-pink-700 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Ajouter une ligne
                  </button>
                </div>

                <div className="space-y-2.5 max-h-72 overflow-y-auto">
                  {devisForm.lignes.map((l, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-xs">
                      <div className="sm:col-span-3">
                        <input
                          type="text"
                          value={l.designation}
                          onChange={(e) => handleUpdateDevisLigne(idx, 'designation', e.target.value)}
                          placeholder="Désignation"
                          className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <select
                          value={l.mode_calcul}
                          onChange={(e) => handleUpdateDevisLigne(idx, 'mode_calcul', e.target.value)}
                          className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px]"
                        >
                          <option value="m2">Au m²</option>
                          <option value="unite">À l'unité</option>
                          <option value="page">À la page</option>
                          <option value="heure">À l'heure</option>
                          <option value="forfait">Forfait</option>
                        </select>
                      </div>

                      {l.mode_calcul === 'm2' ? (
                        <>
                          <div className="sm:col-span-1">
                            <input
                              type="number"
                              step="0.01"
                              value={l.largeur}
                              onChange={(e) => handleUpdateDevisLigne(idx, 'largeur', e.target.value)}
                              placeholder="Larg(m)"
                              title="Largeur en mètres"
                              className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-center"
                            />
                          </div>
                          <div className="sm:col-span-1">
                            <input
                              type="number"
                              step="0.01"
                              value={l.hauteur}
                              onChange={(e) => handleUpdateDevisLigne(idx, 'hauteur', e.target.value)}
                              placeholder="Haut(m)"
                              title="Hauteur en mètres"
                              className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-center"
                            />
                          </div>
                          <div className="sm:col-span-1 text-center font-mono font-bold text-slate-700">
                            {l.surface_m2} m²
                          </div>
                        </>
                      ) : (
                        <div className="sm:col-span-3 text-slate-400 text-center text-[10px]">Tarif unitaire fixe</div>
                      )}

                      <div className="sm:col-span-1">
                        <input
                          type="number"
                          value={l.quantite}
                          onChange={(e) => handleUpdateDevisLigne(idx, 'quantite', e.target.value)}
                          placeholder="Qté"
                          title="Quantité"
                          className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-center font-bold"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          value={l.prix_unitaire}
                          onChange={(e) => handleUpdateDevisLigne(idx, 'prix_unitaire', e.target.value)}
                          placeholder="P.U."
                          className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-right font-semibold"
                        />
                      </div>

                      <div className="sm:col-span-1 text-right font-black text-slate-900">
                        {l.montant_ttc?.toLocaleString('fr-FR')} F
                      </div>

                      <div className="sm:col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveDevisLigne(idx)}
                          className="text-slate-400 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Récapitulatif Devis */}
              <div className="p-4 bg-pink-50/70 rounded-2xl flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">Total Devis Estimatif :</span>
                <span className="text-lg font-black text-pink-700">
                  {devisForm.lignes.reduce((acc, l) => acc + (l.montant_ttc || 0), 0).toLocaleString('fr-FR')} FCFA
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDevisModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
                >
                  Enregistrer & Chiffrer le Devis
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL ENCAISSEMENT CAISSIÈRE (ACOMPTE / SOLDE) ── */}
      {showEncaissementModal && selectedCommande && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-base text-slate-900">Encaissement Commande</h3>
                <p className="text-xs text-slate-500 font-mono">{selectedCommande.numero_commande}</p>
              </div>
              <button onClick={() => setShowEncaissementModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleValiderEncaissement} className="space-y-3.5 text-xs">
              <div className="p-3 bg-slate-50 rounded-2xl space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Client :</span>
                  <span className="font-bold text-slate-800">{selectedCommande.client_nom}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total commande :</span>
                  <span className="font-bold text-slate-900">{selectedCommande.total_ttc.toLocaleString('fr-FR')} F</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Déjà payé :</span>
                  <span className="font-bold text-emerald-600">{selectedCommande.montant_paye.toLocaleString('fr-FR')} F</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1 font-black">
                  <span className="text-slate-700">Reste à payer :</span>
                  <span className="text-amber-600">{selectedCommande.solde_restant.toLocaleString('fr-FR')} F</span>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Montant Encaissé (FCFA) *</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={paiementForm.montant}
                  onChange={(e) => setPaiementForm((p) => ({ ...p, montant: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-base font-black text-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Mode de Paiement</label>
                  <select
                    value={paiementForm.mode_paiement}
                    onChange={(e) => setPaiementForm((p) => ({ ...p, mode_paiement: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                  >
                    <option value="especes">Espèces</option>
                    <option value="momo_mtn">MTN MoMo</option>
                    <option value="momo_moov">Moov Money</option>
                    <option value="banque">Virement / Banque</option>
                    <option value="cheque">Chèque</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Type de Paiement</label>
                  <select
                    value={paiementForm.type_paiement}
                    onChange={(e) => setPaiementForm((p) => ({ ...p, type_paiement: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                  >
                    <option value="acompte">Acompte</option>
                    <option value="solde">Solde total</option>
                    <option value="partiel">Partiel</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEncaissementModal(false)}
                  className="px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black shadow-xs transition"
                >
                  Valider l'Encaissement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL CONSOMMATION RÉELLE & PERTES/CHUTES MATIÈRES ── */}
      {showConsommationModal && selectedCommande && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-base text-slate-900">Consommation Réelle & Chutes</h3>
                <p className="text-xs text-slate-500 font-mono">{selectedCommande.numero_commande}</p>
              </div>
              <button onClick={() => setShowConsommationModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleValiderConsommation} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Matière Première Consommée *</label>
                <select
                  required
                  value={consoForm.matiere_id}
                  onChange={(e) => setConsoForm((p) => ({ ...p, matiere_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold"
                >
                  <option value="">-- Sélectionner une matière --</option>
                  {matieres.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nom} (Stock actuel : {m.stock_actuel} {m.unite})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Quantité Réelle Utilisée *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={consoForm.quantite_reelle}
                    onChange={(e) => setConsoForm((p) => ({ ...p, quantite_reelle: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Quantité Prévue / B.A.T.</label>
                  <input
                    type="number"
                    step="0.01"
                    value={consoForm.quantite_prevue}
                    onChange={(e) => setConsoForm((p) => ({ ...p, quantite_prevue: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Motif d'Écart / Chute / Perte</label>
                <select
                  value={consoForm.motif_perte}
                  onChange={(e) => setConsoForm((p) => ({ ...p, motif_perte: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold"
                >
                  <option value="chute">Chute normale de découpe</option>
                  <option value="erreur_impression">Erreur d'impression machine</option>
                  <option value="defaut_matiere">Défaut matière / support abîmé</option>
                  <option value="mauvaise_manipulation">Mauvaise manipulation atelier</option>
                  <option value="reimpression">Réimpression interne</option>
                  <option value="autre">Autre motif</option>
                </select>
              </div>

              <label className="flex items-center gap-2 p-2.5 bg-rose-50 rounded-xl border border-rose-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consoForm.est_reimpression}
                  onChange={(e) => setConsoForm((p) => ({ ...p, est_reimpression: e.target.checked }))}
                  className="w-4 h-4 accent-rose-600 rounded"
                />
                <span className="font-bold text-rose-800">Cocher s'il s'agit d'une réimpression interne non refacturée au client</span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConsommationModal(false)}
                  className="px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl font-bold shadow-xs transition"
                >
                  Déduire du Stock & Actualiser Marge
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default ImprimerieDevisProductionPage
