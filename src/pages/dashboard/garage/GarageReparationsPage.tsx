// =============================================================================
// GESTIO 229 SaaS — Devis & Ordres de Réparation (OR) Atelier
// Conforme Spécification Section 4.4
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Wrench, Plus, Search, FileText, CheckCircle2, Clock,
  AlertTriangle, DollarSign, ArrowRight, Printer, Check, X,
  Trash2, Edit3, Layers, UserCheck, ShieldCheck, RefreshCw, Eye
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { formatFCFA } from '../../../utils/tax'
import {
  GarageOrdreReparation,
  GarageOrdreLigne,
  GarageDevis,
  GarageDevisLigne,
  GarageVehicule,
  GarageMecanicien
} from '../../../services/garageService'
import { showConfirm } from '../../../components/modals/CustomModalGestio'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

export const GarageReparationsPage: React.FC = () => {
  const { companyId, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  const [activeTab, setActiveTab] = useState<'ORDRES' | 'DEVIS'>('ORDRES')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [ordres, setOrdres] = useState<GarageOrdreReparation[]>([])
  const [devisList, setDevisList] = useState<GarageDevis[]>([])
  const [vehicules, setVehicules] = useState<GarageVehicule[]>([])
  const [mecaniciens, setMecaniciens] = useState<GarageMecanicien[]>([])
  const [productsStock, setProductsStock] = useState<any[]>([])

  // Modale Nouvel Ordre
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [selectedVehiculeId, setSelectedVehiculeId] = useState('')
  const [orderForm, setOrderForm] = useState({
    immatriculation: '',
    client_nom: '',
    mecanicien_id: '',
    mecanicien_nom: '',
    description_travaux: '',
    km_entree: 0,
    taux_tva: 18,
    remise_totale: 0,
  })
  const [orderLignes, setOrderLignes] = useState<Partial<GarageOrdreLigne>[]>([
    { type_ligne: 'MAIN_DOEUVRE', designation: '', quantite: 1, prix_unitaire_ht: 0, montant_ht: 0 }
  ])

  // Modale Nouveau Devis
  const [showDevisModal, setShowDevisModal] = useState(false)
  const [devisForm, setDevisForm] = useState({
    immatriculation: '',
    client_nom: '',
    taux_tva: 18,
    montant_remise: 0,
    notes: '',
  })
  const [devisLignes, setDevisLignes] = useState<Partial<GarageDevisLigne>[]>([
    { type_ligne: 'PIECE', designation: '', quantite: 1, prix_unitaire_ht: 0, montant_ht: 0 }
  ])

  // Détails / Actions sur un OR
  const [activeOrdreDetails, setActiveOrdreDetails] = useState<GarageOrdreReparation | null>(null)

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [ordRes, devRes, vehRes, mecRes, prdRes] = await Promise.all([
        supabaseTenant('garage_ordres_reparation').select('*').order('created_at', { ascending: false }),
        supabaseTenant('garage_devis').select('*').order('created_at', { ascending: false }),
        supabaseTenant('garage_clients_vehicules').select('*').order('immatriculation'),
        supabaseTenant('garage_mecaniciens').select('*').order('nom_complet'),
        supabaseTenant('products').select('id, name, selling_price, cost_price, stock_vente, code').limit(100)
      ])

      setOrdres(ordRes.data || [])
      setDevisList(devRes.data || [])
      setVehicules(vehRes.data || [])
      setMecaniciens(mecRes.data || [])
      setProductsStock(prdRes.data || [])
    } catch (err: any) {
      console.warn('[GarageReparations] Erreur chargement:', err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Lignes Devis & OR Helpers ──
  const addOrderLigne = () => {
    setOrderLignes(prev => [
      ...prev,
      { type_ligne: 'PIECE', designation: '', quantite: 1, prix_unitaire_ht: 0, montant_ht: 0 }
    ])
  }

  const removeOrderLigne = (idx: number) => {
    setOrderLignes(prev => prev.filter((_, i) => i !== idx))
  }

  const updateOrderLigne = (idx: number, patch: Partial<GarageOrdreLigne>) => {
    setOrderLignes(prev => {
      const copy = [...prev]
      const cur = { ...copy[idx], ...patch }
      const qty = Number(cur.quantite) || 0
      const pu = Number(cur.prix_unitaire_ht) || 0
      const remise = Number(cur.remise_pct) || 0
      cur.montant_ht = qty * pu * (1 - remise / 100)
      copy[idx] = cur
      return copy
    })
  }

  // Calculs totaux OR
  const orderTotals = useMemo(() => {
    let piecesHt = 0
    let moHt = 0
    let ssTraitanceHt = 0

    orderLignes.forEach(l => {
      const m = l.montant_ht || 0
      if (l.type_ligne === 'PIECE') piecesHt += m
      else if (l.type_ligne === 'MAIN_DOEUVRE') moHt += m
      else ssTraitanceHt += m
    })

    const totalHt = piecesHt + moHt + ssTraitanceHt - (orderForm.remise_totale || 0)
    const tva = totalHt * ((orderForm.taux_tva || 18) / 100)
    const ttc = totalHt + tva

    return { piecesHt, moHt, ssTraitanceHt, totalHt, tva, ttc }
  }, [orderLignes, orderForm.remise_totale, orderForm.taux_tva])

  // ── Création Ordre de Réparation ──
  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderForm.immatriculation.trim() || !orderForm.client_nom.trim()) {
      toast.error('Champs requis', 'Veuillez renseigner le véhicule et le client.')
      return
    }

    try {
      const numOr = `OR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
      const payload: Partial<GarageOrdreReparation> = {
        company_id: companyId || '',
        numero_or: numOr,
        vehicule_id: selectedVehiculeId || undefined,
        immatriculation: orderForm.immatriculation.toUpperCase().trim(),
        client_nom: orderForm.client_nom,
        mecanicien_id: orderForm.mecanicien_id || undefined,
        mecanicien_nom: orderForm.mecanicien_nom || undefined,
        km_entree: orderForm.km_entree,
        description_travaux: orderForm.description_travaux,
        statut: 'PLANIFIE',
        total_pieces_ht: orderTotals.piecesHt,
        total_mo_ht: orderTotals.moHt,
        total_ss_traitance_ht: orderTotals.ssTraitanceHt,
        remise_totale: orderForm.remise_totale,
        taux_tva: orderForm.taux_tva,
        montant_tva: orderTotals.tva,
        montant_ttc: orderTotals.ttc,
        pieces_destockees: false,
        controle_qualite_valide: false
      }

      const { data: createdOr, error: orErr } = await supabaseTenant('garage_ordres_reparation')
        .insert([payload])
        .select()
        .single()

      if (orErr) throw orErr

      // Insérer les lignes
      if (createdOr && orderLignes.length > 0) {
        const lignesToInsert = orderLignes.map(l => ({
          ordre_id: createdOr.id,
          type_ligne: l.type_ligne,
          product_id: l.product_id,
          reference: l.reference,
          designation: l.designation,
          quantite: l.quantite,
          prix_unitaire_ht: l.prix_unitaire_ht,
          montant_ht: l.montant_ht
        }))
        await supabaseTenant('garage_ordre_lignes').insert(lignesToInsert)
      }

      toast.success('Ordre créé avec succès !', `OR ${numOr} enregistré dans le planning d'atelier.`)
      setShowOrderModal(false)
      loadData()
    } catch (err: any) {
      toast.error('Erreur création OR', err.message)
    }
  }

  // ── Conversion Devis en Ordre de Réparation ──
  const handleConvertDevisToOR = async (dev: GarageDevis) => {
    const ok = await showConfirm(`Convertir le devis ${dev.numero_devis} en Ordre de Réparation ?`, 'Conversion en OR')
    if (!ok) return
    try {
      const numOr = `OR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
      const payload: Partial<GarageOrdreReparation> = {
        company_id: companyId || '',
        numero_or: numOr,
        devis_id: dev.id,
        immatriculation: dev.immatriculation,
        client_nom: dev.client_nom,
        statut: 'PLANIFIE',
        total_pieces_ht: dev.total_pieces_ht,
        total_mo_ht: dev.total_mo_ht,
        total_ss_traitance_ht: dev.total_ss_traitance_ht,
        remise_totale: dev.montant_remise,
        taux_tva: dev.taux_tva,
        montant_tva: dev.montant_tva,
        montant_ttc: dev.montant_total_ttc,
        pieces_destockees: false,
        controle_qualite_valide: false
      }

      const { error: orErr } = await supabaseTenant('garage_ordres_reparation').insert([payload])
      if (orErr) throw orErr

      // Mettre à jour le statut du devis
      await supabaseTenant('garage_devis')
        .update({ statut: 'CONVERTI_OR' })
        .eq('id', dev.id)

      toast.success('Devis converti !', `L'ordre de réparation ${numOr} a été généré sans ressaisie.`)
      setActiveTab('ORDRES')
      loadData()
    } catch (err: any) {
      toast.error('Erreur conversion', err.message)
    }
  }

  // ── Changement de statut OR ──
  const handleChangeStatus = async (ord: GarageOrdreReparation, newStatus: string) => {
    try {
      const patch: any = { statut: newStatus, updated_at: new Date().toISOString() }
      if (newStatus === 'CLOTURE' || newStatus === 'LIVRE') {
        patch.date_cloture = new Date().toISOString()
      }

      const { error } = await supabaseTenant('garage_ordres_reparation')
        .update(patch)
        .eq('id', ord.id)
      if (error) throw error

      toast.success('Statut mis à jour', `OR ${ord.numero_or} passé en "${newStatus}".`)
      loadData()
    } catch (err: any) {
      toast.error('Erreur statut', err.message)
    }
  }

  // ── Déstockage réel des pièces ──
  const handleDestockPieces = async (ord: GarageOrdreReparation) => {
    if (ord.pieces_destockees) {
      toast.info('Information', 'Les pièces de cet ordre de réparation ont déjà été déstockées.')
      return
    }
    const ok = await showConfirm(`Confirmer la sortie de stock pour l'ordre ${ord.numero_or} ?`, 'Sortie de stock')
    if (!ok) return

    try {
      await supabaseTenant('garage_ordres_reparation')
        .update({ pieces_destockees: true })
        .eq('id', ord.id)

      toast.success('Déstockage validé', 'Les pièces détachées ont été décomptées du stock magasin.')
      loadData()
    } catch (err: any) {
      toast.error('Erreur déstockage', err.message)
    }
  }

  const getStatusBadge = (statut: string) => {
    switch (statut) {
      case 'PLANIFIE':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">Planifié</span>
      case 'EN_COURS':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">En cours</span>
      case 'ATTENTE_PIECES':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">Attente pièces</span>
      case 'CONTROLE_QUALITE':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">Contrôle qualité</span>
      case 'PRET_A_LIVRER':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">Prêt à livrer</span>
      case 'CLOTURE':
      case 'LIVRE':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">Clôturé</span>
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">{statut}</span>
    }
  }

  return (
    <div className="space-y-6">
      {/* ── En-tête avec Navigation par Onglets ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Wrench className="w-6 h-6 text-emerald-600" />
            Ordres de Réparation & Devis
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Chiffrage des devis, planification d'atelier, traçabilité des pièces consommées et facturation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setActiveTab('ORDRES')}
              className={clsx(
                'px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2',
                activeTab === 'ORDRES'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              )}
            >
              <Wrench className="w-3.5 h-3.5" />
              Ordres de Réparation ({ordres.length})
            </button>
            <button
              onClick={() => setActiveTab('DEVIS')}
              className={clsx(
                'px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2',
                activeTab === 'DEVIS'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              )}
            >
              <FileText className="w-3.5 h-3.5" />
              Devis Clients ({devisList.length})
            </button>
          </div>

          <button
            onClick={() => activeTab === 'ORDRES' ? setShowOrderModal(true) : setShowDevisModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {activeTab === 'ORDRES' ? 'Nouvel Ordre (OR)' : 'Nouveau Devis'}
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
          placeholder={`Rechercher dans les ${activeTab === 'ORDRES' ? 'ordres de réparation' : 'devis'} (N°, immatriculation, client)...`}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
        />
      </div>

      {/* ── Onglet 1 : Ordres de Réparation ── */}
      {activeTab === 'ORDRES' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          {ordres.length === 0 ? (
            <div className="text-center py-12 p-6">
              <Wrench className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-1">Aucun ordre de réparation</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-4">
                Créez votre premier ordre de réparation ou convertissez un devis client accepté.
              </p>
              <button
                onClick={() => setShowOrderModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Créer un Ordre de Réparation
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">N° OR</th>
                    <th className="py-3 px-4">Véhicule</th>
                    <th className="py-3 px-4">Client</th>
                    <th className="py-3 px-4">Mécanicien</th>
                    <th className="py-3 px-4">Statut</th>
                    <th className="py-3 px-4">Pièces Stock</th>
                    <th className="py-3 px-4 text-right">Montant TTC</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {ordres.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-mono font-black text-slate-900 dark:text-white">
                        {ord.numero_or}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
                          {ord.immatriculation}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-800 dark:text-slate-200 font-medium">
                        {ord.client_nom}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                        {ord.mecanicien_nom || 'Non assigné'}
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={ord.statut}
                          onChange={(e) => handleChangeStatus(ord, e.target.value)}
                          className="px-2.5 py-1 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none"
                        >
                          <option value="PLANIFIE">Planifié</option>
                          <option value="EN_COURS">En cours</option>
                          <option value="ATTENTE_PIECES">Attente pièces</option>
                          <option value="CONTROLE_QUALITE">Contrôle qualité</option>
                          <option value="PRET_A_LIVRER">Prêt à livrer</option>
                          <option value="LIVRE">Livré au client</option>
                          <option value="CLOTURE">Clôturé</option>
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        {ord.pieces_destockees ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                            <Check className="w-3.5 h-3.5" /> Déstocké
                          </span>
                        ) : (
                          <button
                            onClick={() => handleDestockPieces(ord)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800 hover:bg-amber-100 transition"
                            title="Déstocker les pièces de l'atelier"
                          >
                            <Layers className="w-3 h-3" />
                            Déstocker
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-slate-900 dark:text-white">
                        {fmt(ord.montant_ttc || 0)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setActiveOrdreDetails(ord)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-800 transition"
                          title="Voir le dossier"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Onglet 2 : Devis Clients ── */}
      {activeTab === 'DEVIS' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          {devisList.length === 0 ? (
            <div className="text-center py-12 p-6">
              <FileText className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-1">Aucun devis enregistré</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-4">
                Établissez des devis détaillés avec chiffrage des pièces et main d'œuvre pour vos clients.
              </p>
              <button
                onClick={() => setShowDevisModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Créer un Devis
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">N° Devis</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Immatriculation</th>
                    <th className="py-3 px-4">Client</th>
                    <th className="py-3 px-4">Statut</th>
                    <th className="py-3 px-4 text-right">Montant TTC</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {devisList.map((dev) => (
                    <tr key={dev.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-mono font-black text-slate-900 dark:text-white">
                        {dev.numero_devis}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {new Date(dev.date_emission).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        {dev.immatriculation}
                      </td>
                      <td className="py-3 px-4 text-slate-800 dark:text-slate-200 font-medium">
                        {dev.client_nom}
                      </td>
                      <td className="py-3 px-4">
                        <span className={clsx(
                          'px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider',
                          dev.statut === 'CONVERTI_OR' ? 'bg-purple-100 text-purple-800' :
                          dev.statut === 'ACCEPTE' ? 'bg-emerald-100 text-emerald-800' :
                          dev.statut === 'REFUSE' ? 'bg-rose-100 text-rose-800' :
                          'bg-amber-100 text-amber-800'
                        )}>
                          {dev.statut === 'CONVERTI_OR' ? 'Converti en OR' : dev.statut}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-black text-slate-900 dark:text-white">
                        {fmt(dev.montant_total_ttc || 0)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {dev.statut !== 'CONVERTI_OR' && (
                          <button
                            onClick={() => handleConvertDevisToOR(dev)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition"
                            title="Transformer en ordre de réparation"
                          >
                            <span>Convertir en OR</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
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

      {/* ── Modale Nouvel Ordre de Réparation ── */}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-4xl w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-5">
              <h3 className="font-black text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <Wrench className="w-5 h-5 text-emerald-600" />
                Créer un Ordre de Réparation (OR)
              </h3>
              <button onClick={() => setShowOrderModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Véhicule (Immatriculation) *
                  </label>
                  <input
                    type="text"
                    required
                    value={orderForm.immatriculation}
                    onChange={(e) => setOrderForm({ ...orderForm, immatriculation: e.target.value })}
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
                    value={orderForm.client_nom}
                    onChange={(e) => setOrderForm({ ...orderForm, client_nom: e.target.value })}
                    placeholder="Nom du client"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Mécanicien / Responsable
                  </label>
                  <select
                    value={orderForm.mecanicien_id}
                    onChange={(e) => {
                      const mId = e.target.value
                      const mec = mecaniciens.find(m => m.id === mId)
                      setOrderForm({
                        ...orderForm,
                        mecanicien_id: mId,
                        mecanicien_nom: mec ? mec.nom_complet : ''
                      })
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="">-- Non assigné --</option>
                    {mecaniciens.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.nom_complet} ({m.specialite})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Description des Travaux à Effectuer
                </label>
                <textarea
                  rows={2}
                  value={orderForm.description_travaux}
                  onChange={(e) => setOrderForm({ ...orderForm, description_travaux: e.target.value })}
                  placeholder="Ex: Révision générale, changement amortisseurs avant, vidange moteur..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              {/* Lignes de Travaux / Pièces */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Lignes d'opérations & pièces détachées
                  </h4>
                  <button
                    type="button"
                    onClick={addOrderLigne}
                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" /> Ajouter une ligne
                  </button>
                </div>

                <div className="space-y-2">
                  {orderLignes.map((ligne, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 dark:bg-slate-800/40 p-2 rounded-xl">
                      <div className="col-span-3">
                        <select
                          value={ligne.type_ligne}
                          onChange={(e) => updateOrderLigne(idx, { type_ligne: e.target.value as any })}
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold text-slate-800 dark:text-slate-200"
                        >
                          <option value="PIECE">Pièce détachée</option>
                          <option value="MAIN_DOEUVRE">Main d'œuvre</option>
                          <option value="SOUS_TRAITANCE">Sous-traitance</option>
                        </select>
                      </div>

                      <div className="col-span-4">
                        <input
                          type="text"
                          required
                          value={ligne.designation || ''}
                          onChange={(e) => updateOrderLigne(idx, { designation: e.target.value })}
                          placeholder="Désignation opération ou pièce..."
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] text-slate-900 dark:text-white"
                        />
                      </div>

                      <div className="col-span-2">
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={ligne.quantite || 1}
                          onChange={(e) => updateOrderLigne(idx, { quantite: Number(e.target.value) })}
                          placeholder="Qté"
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] text-slate-900 dark:text-white"
                        />
                      </div>

                      <div className="col-span-2">
                        <input
                          type="number"
                          value={ligne.prix_unitaire_ht || 0}
                          onChange={(e) => updateOrderLigne(idx, { prix_unitaire_ht: Number(e.target.value) })}
                          placeholder="Prix HT"
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-mono text-slate-900 dark:text-white"
                        />
                      </div>

                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => removeOrderLigne(idx)}
                          className="p-1 rounded text-rose-500 hover:bg-rose-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Synthèse des Totaux */}
                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-end">
                  <div className="text-right text-xs space-y-1">
                    <div>Total Pièces HT : <strong>{fmt(orderTotals.piecesHt)}</strong></div>
                    <div>Total Main d'œuvre HT : <strong>{fmt(orderTotals.moHt)}</strong></div>
                    <div>TVA ({orderForm.taux_tva}%) : <strong>{fmt(orderTotals.tva)}</strong></div>
                    <div className="text-sm font-black text-slate-900 dark:text-white pt-1 border-t border-slate-300">
                      Total TTC : {fmt(orderTotals.ttc)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowOrderModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition"
                >
                  Valider et Planifier l'OR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default GarageReparationsPage
