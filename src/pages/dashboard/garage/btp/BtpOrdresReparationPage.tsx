// =============================================================================
// GESTIO 229 SaaS — Ordres de Réparation (OR) Parc Matériels BTP
// Conforme Spécification Section Module 1
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Wrench, Plus, Search, FileText, CheckCircle2, Clock,
  AlertTriangle, DollarSign, ArrowRight, Printer, Check, X,
  Trash2, Edit3, Layers, UserCheck, ShieldCheck, RefreshCw, Eye,
  Building2, HardHat, Truck, Package, ShieldAlert, FileCheck
} from 'lucide-react'
import { useTenant } from '../../../../hooks/useTenant'
import { useUIStore } from '../../../../store/uiStore'
import { formatFCFA } from '../../../../utils/tax'
import {
  BtpOrdreReparation,
  BtpReparationMecanicien,
  BtpReparationPiece,
  BtpMateriel,
  BtpSite,
  BtpChantier,
  BtpOrStatut
} from '../../../../services/garageService'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

const STATUTS_LABELS: Record<BtpOrStatut, { label: string; color: string }> = {
  BROUILLON: { label: 'Brouillon', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  EN_ATTENTE_VALIDATION: { label: 'Attente Validation', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-400' },
  VALIDE: { label: 'Validé', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400' },
  MECANICIEN_AFFECTE: { label: 'Mécanicien Affecté', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-400' },
  EN_DIAGNOSTIC: { label: 'En Diagnostic', color: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-400' },
  EN_COURS: { label: 'En Réparation', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400' },
  ATTENTE_PIECES: { label: 'Attente Pièces', color: 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-400' },
  VALIDATION_TECHNIQUE: { label: 'Validation Technique', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-400' },
  REPARE: { label: 'Réparé', color: 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-400' },
  TEST_EFFECTUE: { label: 'Test Effectué', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400' },
  CLOTURE: { label: 'Clôturé & Opérationnel', color: 'bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-400' },
  ANNULE: { label: 'Annulé', color: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-400' }
}

export const BtpOrdresReparationPage: React.FC = () => {
  const { companyId, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatut, setFilterStatut] = useState<string>('ALL')

  const [ordres, setOrdres] = useState<BtpOrdreReparation[]>([])
  const [materiels, setMateriels] = useState<BtpMateriel[]>([])
  const [sites, setSites] = useState<BtpSite[]>([])
  const [chantiers, setChantiers] = useState<BtpChantier[]>([])
  const [productsStock, setProductsStock] = useState<any[]>([])
  const [mecaniciensList, setMecaniciensList] = useState<any[]>([])

  // Modale Nouvel OR
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    materiel_id: '',
    site_id: '',
    chantier_id: '',
    demandeur_nom: '',
    description_panne: '',
    symptomes_constates: '',
    priorite: 'NORMALE' as 'FAIBLE' | 'NORMALE' | 'ELEVEE' | 'URGENTE',
    type_intervention: 'CORRECTIVE' as 'CORRECTIVE' | 'PREVENTIVE' | 'DIAGNOSTIC' | 'REVISION' | 'CONTROLE_TECHNIQUE',
    diagnostic_mecanicien: '',
    travaux_a_effectuer: '',
    cout_previsionnel: 0,
    date_debut_prevue: '',
    date_fin_prevue: '',
    pieces_demandees: [{ designation: '', reference: '', quantite_prevue: 1, prix_unitaire_ht: 0 }]
  })

  // Fiche Détail / Circuit de validation
  const [activeOrdre, setActiveOrdre] = useState<BtpOrdreReparation | null>(null)
  const [ordreMecaniciens, setOrdreMecaniciens] = useState<BtpReparationMecanicien[]>([])
  const [ordrePieces, setOrdrePieces] = useState<BtpReparationPiece[]>([])

  // Modale Clôture & Essais
  const [showClotureModal, setShowClotureModal] = useState(false)
  const [clotureForm, setClotureForm] = useState({
    essais_details: 'Essais de charge et contrôle des circuits hydrauliques effectués avec succès.',
    essais_reussis: true,
    autorisation_remise: true,
    cloture_par: '',
    cout_reel_mo: 0,
    cout_reel_pieces: 0,
    cout_reel_consommables: 0,
    cout_reel_sous_traitance: 0,
    observations: ''
  })

  // Modale Annulation
  const [showAnnuleModal, setShowAnnuleModal] = useState(false)
  const [motifAnnulation, setMotifAnnulation] = useState('')

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [ordRes, matRes, siteRes, chtRes, prdRes, mecRes] = await Promise.all([
        supabaseTenant('btp_ordres_reparation').select('*, materiel:btp_materiels(*)').order('created_at', { ascending: false }),
        supabaseTenant('btp_materiels').select('*').order('code_materiel'),
        supabaseTenant('btp_sites').select('*').order('nom_site'),
        supabaseTenant('btp_chantiers').select('*').order('nom_chantier'),
        supabaseTenant('products').select('id, name, selling_price, cost_price, stock_vente, code').limit(100),
        supabaseTenant('garage_mecaniciens').select('*').order('nom_complet')
      ])

      setOrdres(ordRes.data || [])
      setMateriels(matRes.data || [])
      setSites(siteRes.data || [])
      setChantiers(chtRes.data || [])
      setProductsStock(prdRes.data || [])
      setMecaniciensList(mecRes.data || [])
    } catch (err: any) {
      console.warn('[BtpOrdresReparation] Erreur chargement:', err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Charger les pièces et mécaniciens liés quand on ouvre un ordre
  const handleViewOrdre = async (ord: BtpOrdreReparation) => {
    setActiveOrdre(ord)
    try {
      const [mecRes, pcsRes] = await Promise.all([
        supabaseTenant('btp_reparation_mecaniciens').select('*').eq('ordre_id', ord.id).order('date_affectation'),
        supabaseTenant('btp_reparation_pieces').select('*').eq('ordre_id', ord.id)
      ])
      setOrdreMecaniciens(mecRes.data || [])
      setOrdrePieces(pcsRes.data || [])
    } catch (e) {
      console.warn('Erreur chargement sous-éléments OR:', e)
    }
  }

  const handleSelectMateriel = (matId: string) => {
    const mat = materiels.find(m => m.id === matId)
    setCreateForm(prev => ({
      ...prev,
      materiel_id: matId,
      site_id: mat?.site_actuel_id || prev.site_id
    }))
  }

  const handleAddPieceLine = () => {
    setCreateForm(prev => ({
      ...prev,
      pieces_demandees: [...prev.pieces_demandees, { designation: '', reference: '', quantite_prevue: 1, prix_unitaire_ht: 0 }]
    }))
  }

  const handleRemovePieceLine = (idx: number) => {
    setCreateForm(prev => ({
      ...prev,
      pieces_demandees: prev.pieces_demandees.filter((_, i) => i !== idx)
    }))
  }

  const handleCreateOR = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createForm.materiel_id) {
      toast.error('Engin requis', 'Veuillez sélectionner l\'engin concerné.')
      return
    }
    if (!createForm.description_panne.trim()) {
      toast.error('Description requise', 'Veuillez décrire la panne constatée.')
      return
    }

    setSubmitting(true)
    try {
      const mat = materiels.find(m => m.id === createForm.materiel_id)
      const numOr = `OR-BTP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
      const compteurActuel = mat
        ? (mat.type_compteur === 'HEURES_MOTEUR' ? mat.compteur_heures_actuel : mat.compteur_km_actuel)
        : 0

      const payload: Partial<BtpOrdreReparation> = {
        company_id: companyId || '',
        numero_or: numOr,
        materiel_id: createForm.materiel_id,
        code_materiel: mat?.code_materiel,
        immatriculation: mat?.immatriculation,
        marque: mat?.marque,
        modele: mat?.modele,
        numero_serie: mat?.numero_serie,
        compteur_valeur: compteurActuel,
        site_id: createForm.site_id || undefined,
        chantier_id: createForm.chantier_id || undefined,
        demandeur_nom: createForm.demandeur_nom || undefined,
        description_panne: createForm.description_panne,
        symptomes_constates: createForm.symptomes_constates || undefined,
        priorite: createForm.priorite,
        type_intervention: createForm.type_intervention,
        diagnostic_mecanicien: createForm.diagnostic_mecanicien || undefined,
        travaux_a_effectuer: createForm.travaux_a_effectuer || undefined,
        cout_previsionnel: Number(createForm.cout_previsionnel) || 0,
        date_debut_prevue: createForm.date_debut_prevue || undefined,
        date_fin_prevue: createForm.date_fin_prevue || undefined,
        statut: 'EN_ATTENTE_VALIDATION'
      }

      const { data: newOr, error } = await supabaseTenant('btp_ordres_reparation')
        .insert([payload])
        .select()
        .single()

      if (error) throw error

      // Création des lignes de pièces prévues
      const piecesPayload = createForm.pieces_demandees
        .filter(p => p.designation.trim())
        .map(p => ({
          company_id: companyId || '',
          ordre_id: newOr.id,
          reference: p.reference || undefined,
          designation: p.designation,
          quantite_prevue: Number(p.quantite_prevue) || 1,
          quantite_utilisee: 0,
          prix_unitaire_ht: Number(p.prix_unitaire_ht) || 0,
          cout_total_ht: (Number(p.quantite_prevue) || 1) * (Number(p.prix_unitaire_ht) || 0),
          est_destocke: false
        }))

      if (piecesPayload.length > 0) {
        await supabaseTenant('btp_reparation_pieces').insert(piecesPayload)
      }

      // Passer le statut de l'engin à "EN_PANNE" si priorité élevée ou urgente
      if (createForm.priorite === 'ELEVEE' || createForm.priorite === 'URGENTE') {
        await supabaseTenant('btp_materiels')
          .update({ statut: 'EN_PANNE', updated_at: new Date().toISOString() })
          .eq('id', createForm.materiel_id)
      }

      toast.success('Ordre de réparation créé', `L'ordre ${numOr} a été enregistré avec succès.`)
      setShowCreateModal(false)
      loadData()
    } catch (err: any) {
      console.error('[handleCreateOR] Erreur:', err)
      toast.error('Erreur', err?.message || 'Impossible de créer l\'ordre de réparation.')
    } finally {
      setSubmitting(false)
    }
  }

  // Changement de statut dans le workflow
  const handleUpdateStatut = async (newStatut: BtpOrStatut) => {
    if (!activeOrdre) return
    setSubmitting(true)
    try {
      const updates: any = {
        statut: newStatut,
        updated_at: new Date().toISOString()
      }

      if (newStatut === 'VALIDE') {
        updates.valide_par = 'Chef d\'Atelier'
      }
      if (newStatut === 'EN_COURS' && !activeOrdre.date_debut_reelle) {
        updates.date_debut_reelle = new Date().toISOString()
        // Engin en maintenance
        await supabaseTenant('btp_materiels')
          .update({ statut: 'EN_MAINTENANCE', updated_at: new Date().toISOString() })
          .eq('id', activeOrdre.materiel_id)
      }

      const { error } = await supabaseTenant('btp_ordres_reparation')
        .update(updates)
        .eq('id', activeOrdre.id)

      if (error) throw error

      toast.success('Statut mis à jour', `L'ordre est passé en statut : ${STATUTS_LABELS[newStatut].label}.`)
      setActiveOrdre(prev => prev ? { ...prev, ...updates } : null)
      loadData()
    } catch (err: any) {
      console.error('[handleUpdateStatut] Erreur:', err)
      toast.error('Erreur', err?.message || 'Impossible de mettre à jour le statut.')
    } finally {
      setSubmitting(false)
    }
  }

  // Validation finale, essais et Clôture
  const handleCloturerOR = async () => {
    if (!activeOrdre) return
    setSubmitting(true)
    try {
      const totalReel =
        Number(clotureForm.cout_reel_mo) +
        Number(clotureForm.cout_reel_pieces) +
        Number(clotureForm.cout_reel_consommables) +
        Number(clotureForm.cout_reel_sous_traitance)

      const updates: any = {
        statut: 'CLOTURE',
        essais_techniques_details: clotureForm.essais_details,
        essais_reussis: clotureForm.essais_reussis,
        autorisation_remise_en_service: clotureForm.autorisation_remise,
        cloture_par: clotureForm.cloture_par || 'Responsable Maintenance BTP',
        cout_reel_mo: Number(clotureForm.cout_reel_mo) || 0,
        cout_reel_pieces: Number(clotureForm.cout_reel_pieces) || 0,
        cout_reel_consommables: Number(clotureForm.cout_reel_consommables) || 0,
        cout_reel_sous_traitance: Number(clotureForm.cout_reel_sous_traitance) || 0,
        cout_reel_total: totalReel,
        date_fin_reelle: new Date().toISOString(),
        observations: clotureForm.observations || undefined,
        updated_at: new Date().toISOString()
      }

      const { error: orErr } = await supabaseTenant('btp_ordres_reparation')
        .update(updates)
        .eq('id', activeOrdre.id)

      if (orErr) throw orErr

      // Règle absolue du cahier des charges : L'engin redevient DISPONIBLE seulement si la réparation est validée et testée !
      if (clotureForm.autorisation_remise && clotureForm.essais_reussis) {
        await supabaseTenant('btp_materiels')
          .update({
            statut: 'DISPONIBLE',
            date_derniere_maintenance: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', activeOrdre.materiel_id)
      }

      toast.success('Ordre de réparation clôturé', 'L\'engin a été vérifié et remis en service avec succès.')
      setShowClotureModal(false)
      setActiveOrdre(null)
      loadData()
    } catch (err: any) {
      console.error('[handleCloturerOR] Erreur:', err)
      toast.error('Erreur', err?.message || 'Impossible de clôturer l\'ordre.')
    } finally {
      setSubmitting(false)
    }
  }

  // Annulation avec motif obligatoire
  const handleAnnulerOR = async () => {
    if (!activeOrdre) return
    if (!motifAnnulation.trim()) {
      toast.error('Motif obligatoire', 'Veuillez saisir le motif obligatoire d\'annulation.')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabaseTenant('btp_ordres_reparation')
        .update({
          statut: 'ANNULE',
          motif_annulation: motifAnnulation.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', activeOrdre.id)

      if (error) throw error

      toast.success('Ordre annulé', 'L\'ordre de réparation a été annulé avec traçabilité du motif.')
      setShowAnnuleModal(false)
      setActiveOrdre(null)
      loadData()
    } catch (err: any) {
      console.error('[handleAnnulerOR] Erreur:', err)
      toast.error('Erreur', err?.message || 'Impossible d\'annuler l\'ordre.')
    } finally {
      setSubmitting(false)
    }
  }

  // Déstockage réel des pièces utilisées
  const handleDestockerPieces = async () => {
    if (!activeOrdre || ordrePieces.length === 0) return
    setSubmitting(true)
    try {
      for (const piece of ordrePieces) {
        if (!piece.est_destocke && piece.product_id && piece.quantite_utilisee > 0) {
          const prod = productsStock.find(p => p.id === piece.product_id)
          if (prod) {
            const newQty = Math.max(0, (Number(prod.stock_vente) || 0) - Number(piece.quantite_utilisee))
            await supabaseTenant('products').update({ stock_vente: newQty }).eq('id', prod.id)
          }
          await supabaseTenant('btp_reparation_pieces')
            .update({ est_destocke: true, date_sortie_stock: new Date().toISOString() })
            .eq('id', piece.id)
        }
      }

      await supabaseTenant('btp_ordres_reparation')
        .update({ pieces_destockees: true, updated_at: new Date().toISOString() })
        .eq('id', activeOrdre.id)

      toast.success('Pièces déstockées', 'Le stock de pièces a été mis à jour avec traçabilité complète.')
      handleViewOrdre(activeOrdre)
    } catch (err: any) {
      toast.error('Erreur déstockage', err?.message || 'Une anomalie est survenue.')
    } finally {
      setSubmitting(false)
    }
  }

  const filteredOrdres = useMemo(() => {
    return ordres.filter(o => {
      const matchSearch =
        o.numero_or.toLowerCase().includes(search.toLowerCase()) ||
        (o.code_materiel && o.code_materiel.toLowerCase().includes(search.toLowerCase())) ||
        (o.immatriculation && o.immatriculation.toLowerCase().includes(search.toLowerCase())) ||
        (o.description_panne && o.description_panne.toLowerCase().includes(search.toLowerCase()))
      const matchStatut = filterStatut === 'ALL' || o.statut === filterStatut
      return matchSearch && matchStatut
    })
  }, [ordres, search, filterStatut])

  return (
    <div className="space-y-6">
      {/* ── En-tête ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">
            <Wrench className="w-3.5 h-3.5" />
            <span>Atelier & Maintenance Parc BTP</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Ordres de Réparation (OR Engins)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Circuit complet de validation, diagnostic, suivi des pièces, essais techniques et clôture des pannes.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-lg shadow-amber-600/20 transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nouvel Ordre de Réparation</span>
        </button>
      </div>

      {/* ── KPI Rapides ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs font-bold uppercase text-slate-400">Total OR</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{ordres.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs font-bold uppercase text-amber-500">En cours / Diagnostic</p>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
            {ordres.filter(o => o.statut === 'EN_COURS' || o.statut === 'EN_DIAGNOSTIC' || o.statut === 'MECANICIEN_AFFECTE').length}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs font-bold uppercase text-red-500">Urgences / Arrêt Chantier</p>
          <p className="text-2xl font-black text-red-600 dark:text-red-400 mt-1">
            {ordres.filter(o => o.priorite === 'URGENTE' && o.statut !== 'CLOTURE' && o.statut !== 'ANNULE').length}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs font-bold uppercase text-emerald-500">Clôturés & Remis en service</p>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {ordres.filter(o => o.statut === 'CLOTURE').length}
          </p>
        </div>
      </div>

      {/* ── Recherche & Filtres ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par OR, engin, immat, panne..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {['ALL', 'EN_ATTENTE_VALIDATION', 'EN_COURS', 'ATTENTE_PIECES', 'CLOTURE'].map(st => (
            <button
              key={st}
              type="button"
              onClick={() => setFilterStatut(st)}
              className={clsx(
                'px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer',
                filterStatut === st
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              )}
            >
              {st === 'ALL' && 'Tous les OR'}
              {st === 'EN_ATTENTE_VALIDATION' && 'À valider'}
              {st === 'EN_COURS' && 'En cours'}
              {st === 'ATTENTE_PIECES' && 'Attente pièces'}
              {st === 'CLOTURE' && 'Clôturés'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Liste des Ordres ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-slate-400">Chargement des ordres de réparation...</p>
          </div>
        ) : filteredOrdres.length === 0 ? (
          <div className="p-12 text-center">
            <Wrench className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Aucun ordre de réparation trouvé</p>
            <p className="text-xs text-slate-400 mt-1">Créez un nouvel ordre pour planifier une intervention mécanique.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredOrdres.map(ord => {
              const badge = STATUTS_LABELS[ord.statut] || STATUTS_LABELS.BROUILLON
              return (
                <div key={ord.id} className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition">
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-xs font-black px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                        {ord.numero_or}
                      </span>
                      <span className={clsx('px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider', badge.color)}>
                        {badge.label}
                      </span>
                      <span className={clsx(
                        'px-2 py-0.5 rounded text-[10px] font-black uppercase',
                        ord.priorite === 'URGENTE' && 'bg-red-500 text-white animate-pulse',
                        ord.priorite === 'ELEVEE' && 'bg-orange-500 text-white',
                        ord.priorite === 'NORMALE' && 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
                        ord.priorite === 'FAIBLE' && 'bg-slate-100 text-slate-600'
                      )}>
                        Priorité : {ord.priorite}
                      </span>
                      <span className="text-xs text-slate-400">
                        Ouvert le {new Date(ord.date_ouverture).toLocaleDateString('fr-FR')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                      <Truck className="w-4 h-4 text-amber-600" />
                      <span>{ord.code_materiel || 'Engin'} — {ord.marque} {ord.modele}</span>
                      {ord.immatriculation && (
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                          {ord.immatriculation}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                      <strong>Panne signalée :</strong> {ord.description_panne}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                      <span>Type : <strong>{ord.type_intervention}</strong></span>
                      {Number(ord.compteur_valeur) > 0 && <span>Compteur : <strong>{ord.compteur_valeur} h/km</strong></span>}
                      {Number(ord.cout_previsionnel) > 0 && <span>Prévu : <strong className="text-slate-700 dark:text-slate-300">{fmt(ord.cout_previsionnel)}</strong></span>}
                      {ord.statut === 'CLOTURE' && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                          Coût réel : {fmt(ord.cout_reel_total)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end lg:self-center">
                    <button
                      type="button"
                      onClick={() => handleViewOrdre(ord)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Ouvrir l'Ordre</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Modal Détail & Circuit de Validation de l'OR ── */}
      {activeOrdre && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 max-w-4xl w-full shadow-2xl space-y-6 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    Ordre de Réparation {activeOrdre.numero_or}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Engin : {activeOrdre.code_materiel} ({activeOrdre.marque} {activeOrdre.modele})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveOrdre(null)}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Barre de Circuit de Validation */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Progression de l'intervention
                </span>
                <span className={clsx('px-3 py-1 rounded-full text-xs font-black uppercase', STATUTS_LABELS[activeOrdre.statut]?.color)}>
                  {STATUTS_LABELS[activeOrdre.statut]?.label}
                </span>
              </div>

              {/* Actions du Workflow */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                {activeOrdre.statut === 'EN_ATTENTE_VALIDATION' && (
                  <button
                    type="button"
                    onClick={() => handleUpdateStatut('VALIDE')}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Valider l'Ordre</span>
                  </button>
                )}

                {activeOrdre.statut === 'VALIDE' && (
                  <button
                    type="button"
                    onClick={() => handleUpdateStatut('EN_DIAGNOSTIC')}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Lancer le diagnostic</span>
                  </button>
                )}

                {(activeOrdre.statut === 'EN_DIAGNOSTIC' || activeOrdre.statut === 'MECANICIEN_AFFECTE') && (
                  <button
                    type="button"
                    onClick={() => handleUpdateStatut('EN_COURS')}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Démarrer les travaux de réparation</span>
                  </button>
                )}

                {activeOrdre.statut === 'EN_COURS' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleUpdateStatut('ATTENTE_PIECES')}
                      className="px-3 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs cursor-pointer"
                    >
                      En attente de pièces
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateStatut('REPARE')}
                      className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Travaux terminés (Réparé)</span>
                    </button>
                  </>
                )}

                {activeOrdre.statut === 'ATTENTE_PIECES' && (
                  <button
                    type="button"
                    onClick={() => handleUpdateStatut('EN_COURS')}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer"
                  >
                    Reprendre les travaux
                  </button>
                )}

                {activeOrdre.statut === 'REPARE' && (
                  <button
                    type="button"
                    onClick={() => handleUpdateStatut('TEST_EFFECTUE')}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileCheck className="w-3.5 h-3.5" />
                    <span>Enregistrer les essais techniques</span>
                  </button>
                )}

                {(activeOrdre.statut === 'TEST_EFFECTUE' || activeOrdre.statut === 'REPARE') && (
                  <button
                    type="button"
                    onClick={() => {
                      setClotureForm({
                        essais_details: activeOrdre.essais_techniques_details || 'Essais techniques concluants.',
                        essais_reussis: true,
                        autorisation_remise: true,
                        cloture_par: '',
                        cout_reel_mo: activeOrdre.cout_reel_mo || 25000,
                        cout_reel_pieces: activeOrdre.cout_reel_pieces || activeOrdre.cout_previsionnel,
                        cout_reel_consommables: 5000,
                        cout_reel_sous_traitance: 0,
                        observations: ''
                      })
                      setShowClotureModal(true)
                    }}
                    className="px-5 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-lg shadow-green-600/20"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Clôturer & Remettre en service</span>
                  </button>
                )}

                {activeOrdre.statut !== 'CLOTURE' && activeOrdre.statut !== 'ANNULE' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMotifAnnulation('')
                      setShowAnnuleModal(true)
                    }}
                    className="px-3 py-2 rounded-xl bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-950/60 dark:text-red-400 font-bold text-xs ml-auto cursor-pointer"
                  >
                    Annuler l'Ordre
                  </button>
                )}
              </div>
            </div>

            {/* Détails techniques de la panne */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl space-y-2 text-xs">
                <p className="font-bold uppercase tracking-wider text-slate-400">Panne & Diagnostic</p>
                <p><strong>Description :</strong> {activeOrdre.description_panne}</p>
                {activeOrdre.symptomes_constates && <p><strong>Symptômes :</strong> {activeOrdre.symptomes_constates}</p>}
                {activeOrdre.diagnostic_mecanicien && <p><strong>Diagnostic mécano :</strong> {activeOrdre.diagnostic_mecanicien}</p>}
                {activeOrdre.travaux_a_effectuer && <p><strong>Travaux prescrits :</strong> {activeOrdre.travaux_a_effectuer}</p>}
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl space-y-2 text-xs">
                <p className="font-bold uppercase tracking-wider text-slate-400">Chiffrage Prévisionnel vs Réel</p>
                <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700">
                  <span>Coût prévisionnel :</span>
                  <span className="font-bold">{fmt(activeOrdre.cout_previsionnel)}</span>
                </div>
                {activeOrdre.statut === 'CLOTURE' && (
                  <>
                    <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700">
                      <span>Coût réel Pièces :</span>
                      <span>{fmt(activeOrdre.cout_reel_pieces)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700">
                      <span>Coût réel Main-d'œuvre :</span>
                      <span>{fmt(activeOrdre.cout_reel_mo)}</span>
                    </div>
                    <div className="flex justify-between py-1 font-black text-emerald-600 dark:text-emerald-400 text-sm">
                      <span>Total Réel Clôturé :</span>
                      <span>{fmt(activeOrdre.cout_reel_total)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Pièces détachées & Déstockage */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Package className="w-4 h-4 text-amber-600" />
                  <span>Pièces de rechange & Consommables</span>
                </h4>
                {!activeOrdre.pieces_destockees && ordrePieces.length > 0 && activeOrdre.statut !== 'ANNULE' && (
                  <button
                    type="button"
                    onClick={handleDestockerPieces}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Déstocker les pièces</span>
                  </button>
                )}
              </div>

              {ordrePieces.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Aucune pièce spécifique enregistrée pour cet ordre.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 font-bold uppercase">
                      <tr>
                        <th className="p-2.5">Référence / Désignation</th>
                        <th className="p-2.5 text-center">Qté Prévue</th>
                        <th className="p-2.5 text-center">Qté Utilisée</th>
                        <th className="p-2.5 text-right">P.U HT</th>
                        <th className="p-2.5 text-center">Statut Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {ordrePieces.map(p => (
                        <tr key={p.id}>
                          <td className="p-2.5 font-semibold text-slate-800 dark:text-slate-200">
                            {p.reference ? `[${p.reference}] ` : ''}{p.designation}
                          </td>
                          <td className="p-2.5 text-center font-bold">{p.quantite_prevue}</td>
                          <td className="p-2.5 text-center font-bold text-amber-600">{p.quantite_utilisee || p.quantite_prevue}</td>
                          <td className="p-2.5 text-right">{fmt(p.prix_unitaire_ht)}</td>
                          <td className="p-2.5 text-center">
                            {p.est_destocke ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">Déstocké</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">En réserve</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Mécaniciens affectés */}
            <div className="space-y-3">
              <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-amber-600" />
                <span>Mécaniciens affectés à cette intervention</span>
              </h4>
              {ordreMecaniciens.length === 0 ? (
                <p className="text-xs text-slate-400 italic">
                  Aucun mécanicien n'est encore affecté. Rendez-vous dans le module "Affectation des Mécaniciens" pour répartir les tâches.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {ordreMecaniciens.map(mec => (
                    <div key={mec.id} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                      <div className="flex items-center justify-between font-bold">
                        <span>{mec.nom_mecanicien}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
                          {mec.specialite}
                        </span>
                      </div>
                      <p className="text-slate-500">Rôle : {mec.fonction_intervention}</p>
                      {mec.taches_attribuees && <p><strong>Tâches :</strong> {mec.taches_attribuees}</p>}
                      <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-400">
                        <span>Prévu : {mec.temps_prevu_heures}h</span>
                        <span>Effectué : <strong className="text-slate-700 dark:text-slate-200">{mec.temps_reel_heures}h</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Création d'un Ordre de Réparation ── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 max-w-2xl w-full shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    Création d'un Ordre de Réparation BTP
                  </h3>
                  <p className="text-xs text-slate-400">Enregistrement et demande d'intervention sur matériel</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOR} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Engin / Matériel concerné *
                </label>
                <select
                  required
                  value={createForm.materiel_id}
                  onChange={e => handleSelectMateriel(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="">Sélectionner un engin...</option>
                  {materiels.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.code_materiel} — {m.marque} {m.modele} ({m.categorie})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                    Site de rattachement
                  </label>
                  <select
                    value={createForm.site_id}
                    onChange={e => setCreateForm(prev => ({ ...prev, site_id: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                  >
                    <option value="">Sélectionner un site...</option>
                    {sites.map(s => <option key={s.id} value={s.id}>{s.nom_site}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                    Chantier concerné
                  </label>
                  <select
                    value={createForm.chantier_id}
                    onChange={e => setCreateForm(prev => ({ ...prev, chantier_id: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                  >
                    <option value="">Sélectionner un chantier...</option>
                    {chantiers.map(c => <option key={c.id} value={c.id}>{c.nom_chantier}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                    Niveau de Priorité
                  </label>
                  <select
                    value={createForm.priorite}
                    onChange={e => setCreateForm(prev => ({ ...prev, priorite: e.target.value as any }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value="FAIBLE">Faible</option>
                    <option value="NORMALE">Normale</option>
                    <option value="ELEVEE">Élevée</option>
                    <option value="URGENTE">Urgente (Arrêt Chantier)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                    Type d'intervention
                  </label>
                  <select
                    value={createForm.type_intervention}
                    onChange={e => setCreateForm(prev => ({ ...prev, type_intervention: e.target.value as any }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value="CORRECTIVE">Réparation Corrective</option>
                    <option value="PREVENTIVE">Maintenance Préventive</option>
                    <option value="DIAGNOSTIC">Diagnostic approfondi</option>
                    <option value="REVISION">Révision générale</option>
                    <option value="CONTROLE_TECHNIQUE">Contrôle technique</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                    Coût prévisionnel (FCFA)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={createForm.cout_previsionnel}
                    onChange={e => setCreateForm(prev => ({ ...prev, cout_previsionnel: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Description détaillée de la panne *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Ex: Fuite d'huile hydraulique au niveau du vérin de flèche, perte de puissance..."
                  value={createForm.description_panne}
                  onChange={e => setCreateForm(prev => ({ ...prev, description_panne: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Symptômes constatés & Observations du demandeur
                </label>
                <input
                  type="text"
                  placeholder="Ex: Bruit anormal au ralenti, voyant moteur allumé..."
                  value={createForm.symptomes_constates}
                  onChange={e => setCreateForm(prev => ({ ...prev, symptomes_constates: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                />
              </div>

              {/* Lignes de pièces prévues */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-slate-500">Pièces de rechange prévues</span>
                  <button
                    type="button"
                    onClick={handleAddPieceLine}
                    className="text-xs text-amber-600 font-bold hover:underline cursor-pointer"
                  >
                    + Ajouter une pièce
                  </button>
                </div>
                {createForm.pieces_demandees.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Désignation de la pièce..."
                      value={p.designation}
                      onChange={e => {
                        const val = e.target.value
                        setCreateForm(prev => ({
                          ...prev,
                          pieces_demandees: prev.pieces_demandees.map((x, i) => i === idx ? { ...x, designation: val } : x)
                        }))
                      }}
                      className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                    />
                    <input
                      type="number"
                      min="1"
                      placeholder="Qté"
                      value={p.quantite_prevue}
                      onChange={e => {
                        const val = Number(e.target.value)
                        setCreateForm(prev => ({
                          ...prev,
                          pieces_demandees: prev.pieces_demandees.map((x, i) => i === idx ? { ...x, quantite_prevue: val } : x)
                        }))
                      }}
                      className="w-16 px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-center text-slate-900 dark:text-white"
                    />
                    {createForm.pieces_demandees.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemovePieceLine(idx)}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-lg shadow-amber-600/20 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Création en cours...' : 'Enregistrer l\'Ordre de Réparation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Clôture & Essais Techniques ── */}
      {showClotureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-green-500/10 text-green-600 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Clôture & Essais Techniques
                  </h3>
                  <p className="text-xs text-slate-400">Autorisation de remise en service de l'engin</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowClotureModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Détails des essais techniques réalisés
                </label>
                <textarea
                  rows={2}
                  value={clotureForm.essais_details}
                  onChange={e => setClotureForm(prev => ({ ...prev, essais_details: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                    Coût réel Pièces (FCFA)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={clotureForm.cout_reel_pieces}
                    onChange={e => setClotureForm(prev => ({ ...prev, cout_reel_pieces: Number(e.target.value) }))}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                    Coût réel MO (FCFA)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={clotureForm.cout_reel_mo}
                    onChange={e => setClotureForm(prev => ({ ...prev, cout_reel_mo: Number(e.target.value) }))}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-emerald-900 dark:text-emerald-300">
                  <input
                    type="checkbox"
                    checked={clotureForm.essais_reussis}
                    onChange={e => setClotureForm(prev => ({ ...prev, essais_reussis: e.target.checked }))}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Essais techniques concluants et validés</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-emerald-900 dark:text-emerald-300">
                  <input
                    type="checkbox"
                    checked={clotureForm.autorisation_remise}
                    onChange={e => setClotureForm(prev => ({ ...prev, autorisation_remise: e.target.checked }))}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Autoriser la remise en service immédiate de l'engin</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowClotureModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleCloturerOR}
                className="px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-black shadow-md shadow-green-600/20 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Clôture en cours...' : 'Confirmer la Clôture'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Annulation ── */}
      {showAnnuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Motif d'annulation obligatoire
            </h3>
            <p className="text-xs text-slate-400">
              Conformément à la traçabilité ERP, veuillez expliquer pourquoi cet ordre de réparation est annulé.
            </p>
            <textarea
              rows={3}
              required
              placeholder="Saisir le motif d'annulation..."
              value={motifAnnulation}
              onChange={e => setMotifAnnulation(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
            />
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAnnuleModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                Retour
              </button>
              <button
                type="button"
                disabled={submitting || !motifAnnulation.trim()}
                onClick={handleAnnulerOR}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black cursor-pointer disabled:opacity-50"
              >
                Confirmer l'annulation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BtpOrdresReparationPage
