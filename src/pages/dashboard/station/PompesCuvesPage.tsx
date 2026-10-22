// =============================================================================
// GESTIO 229 — Station-Service & Hydrocarbures : Pompes, Cuves, Jaugeages & Réceptions
// =============================================================================
// Isolation absolue : company_id + sector_slug = 'station-service'
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Fuel, Database, Gauge, Truck, Plus, RefreshCw, AlertTriangle, CheckCircle,
  Clock, Calendar, User, Search, ArrowDownRight, ArrowUpRight, Check, X,
  DollarSign, FileText, Building2, Receipt, ShieldCheck
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { showModal, showPrompt } from '../../../components/modals/CustomModalGestio'
import { safeStationInsert, safeStationUpdate } from '../../../utils/stationFuelHelper'
import { StationFuelPricingTab } from '../../../components/station/StationFuelPricingTab'
import { StationDailyFuelSheetModal } from '../../../components/station/StationDailyFuelSheetModal'
import { loadFuelCommercialConfigs, FuelCommercialConfig } from '../../../services/stationFuelService'

interface Cuve {
  id: string
  code: string
  nom: string
  produit: string
  capacite: number
  stock_actuel: number
  stock_theorique: number
  niveau_min: number
  niveau_max: number
  unite: string
  statut: string
  emplacement?: string
}

interface Pompe {
  id: string
  numero_pompe: string
  type_carburant: string
  cuve_associee?: string
  cuve_id?: string
  index_actuel: number
  statut: string
}

interface Jaugeage {
  id: string
  cuve_id: string
  cuve_nom: string
  produit: string
  date_jaugeage: string
  heure_jaugeage: string
  hauteur_cm: number
  volume_mesure: number
  stock_theorique_avant: number
  ecart_volume: number
  temperature?: number
  agent_nom?: string
  observation?: string
}

interface Reception {
  id: string
  reference: string
  fournisseur_nom: string
  fournisseur_id?: string
  date_reception: string
  produit: string
  cuve_nom: string
  cuve_id?: string
  quantite_commandee?: number
  quantite_facturee: number
  quantite_recue: number
  ecart_livraison: number
  prix_achat_litre: number
  prix_achat_ht?: number
  is_tva_applicable?: boolean
  taux_tva?: number
  montant_ht?: number
  montant_tva?: number
  frais_transport?: number
  montant_total: number
  numero_bl?: string
  numero_facture?: string
  numero_bc?: string
  numero_camion?: string
  chauffeur?: string
  statut: string
  observation?: string
}

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))
const fmtVol = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n || 0) + ' L'

export const PompesCuvesPage: React.FC = () => {
  const { companyId, sectorSlug, company, user, isAdmin } = useTenant()
  const { toast } = useUIStore() as any

  const [activeTab, setActiveTab] = useState<'cuves' | 'pompes' | 'jaugeages' | 'receptions' | 'tarifs'>('cuves')
  const [loading, setLoading] = useState(true)

  // Données
  const [cuves, setCuves] = useState<Cuve[]>([])
  const [pompes, setPompes] = useState<Pompe[]>([])
  const [jaugeages, setJaugeages] = useState<Jaugeage[]>([])
  const [receptions, setReceptions] = useState<Reception[]>([])
  const [suppliers, setSuppliers] = useState<{ id: string; company_name: string; phone?: string }[]>([])
  const [fuelConfigs, setFuelConfigs] = useState<FuelCommercialConfig[]>([])
  const [isManualSupplier, setIsManualSupplier] = useState(false)

  // Modales
  const [showCuveModal, setShowCuveModal] = useState(false)
  const [showPompeModal, setShowPompeModal] = useState(false)
  const [showJaugeModal, setShowJaugeModal] = useState(false)
  const [showReceptionModal, setShowReceptionModal] = useState(false)
  const [showDailySheet, setShowDailySheet] = useState(false)

  // Formulaires
  const [cuveForm, setCuveForm] = useState({
    code: '', nom: '', produit: 'Essence Super', capacite: 30000, stock_actuel: 0, niveau_min: 2000
  })

  const [pompeForm, setPompeForm] = useState({
    numero_pompe: '', type_carburant: 'Essence Super', cuve_id: '', index_actuel: 0
  })

  const [jaugeForm, setJaugeForm] = useState({
    cuve_id: '', date_jaugeage: new Date().toISOString().slice(0, 10),
    hauteur_cm: 0, volume_mesure: 0, temperature: 28, agent_nom: '', observation: ''
  })

  const [receptionForm, setReceptionForm] = useState({
    fournisseur_id: '',
    fournisseur_nom: 'SONACOP / Dépôt Akpakpa',
    date_reception: new Date().toISOString().slice(0, 10),
    produit: 'Essence Super',
    cuve_id: '',
    quantite_commandee: 10000,
    quantite_facturee: 10000,
    quantite_recue: 10000,
    prix_achat_litre: 620, // TTC par défaut
    is_tva_applicable: true,
    taux_tva: 18,
    frais_transport: 0,
    numero_bl: '',
    numero_facture: '',
    numero_bc: '',
    numero_camion: '',
    chauffeur: '',
    observation: ''
  })

  const notify = useCallback((type: 'success' | 'error', msg: string) => {
    try {
      if (toast?.[type]) toast[type](msg)
      else if (type === 'error') {
        showModal({
          type: 'error',
          title: 'Erreur Station',
          message: msg,
          domaine: 'www.gestio229.com'
        })
      }
    } catch { /* noop */ }
  }, [toast])

  // ─── Chargement global ───────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const cleanSlug = sectorSlug || 'station-service'

      // 1. Cuves
      const { data: cData } = await supabase
        .from('station_cuves')
        .select('*')
        .eq('company_id', companyId)
        .eq('sector_slug', cleanSlug)
        .order('nom')
      setCuves(cData || [])

      // 2. Pompes
      const { data: pData } = await supabase
        .from('station_pompes')
        .select('*')
        .eq('company_id', companyId)
        .eq('sector_slug', cleanSlug)
        .order('numero_pompe')
      setPompes(pData || [])

      // 3. Jaugeages
      const { data: jData } = await supabase
        .from('station_jaugeages')
        .select('*')
        .eq('company_id', companyId)
        .eq('sector_slug', cleanSlug)
        .order('created_at', { ascending: false })
        .limit(50)
      setJaugeages(jData || [])

      // 4. Réceptions
      const { data: rData } = await supabase
        .from('station_receptions_carburant')
        .select('*')
        .eq('company_id', companyId)
        .eq('sector_slug', cleanSlug)
        .order('created_at', { ascending: false })
        .limit(50)
      setReceptions(rData || [])

      // 5. Fournisseurs réels de l'entreprise
      try {
        const { data: sData } = await supabase
          .from('suppliers')
          .select('id, company_name, phone')
          .eq('company_id', companyId)
          .order('company_name')
        setSuppliers(sData || [])
      } catch (sErr) {
        console.warn('Erreur chargement fournisseurs:', sErr)
      }

      // 6. Tarifs & Paramètres fiscaux carburants
      try {
        const cfgs = await loadFuelCommercialConfigs(companyId, company?.regime_fiscal, company?.default_tva_rate)
        setFuelConfigs(cfgs || [])
      } catch (cErr) {
        console.warn('Erreur chargement tarifs carburants:', cErr)
      }

    } catch (err: any) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [companyId, sectorSlug, company?.regime_fiscal, company?.default_tva_rate])

  useEffect(() => { loadAll() }, [loadAll])

  // ─── Actions : Ajouter une Cuve ──────────────────────────────────────────
  const handleSaveCuve = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cuveForm.nom) return notify('error', 'Le nom de la cuve est requis')
    try {
      const cleanSlug = sectorSlug || 'station-service'
      const capVal = Number(cuveForm.capacite) || 30000
      const stockVal = Number(cuveForm.stock_actuel) || 0
      const minVal = Number(cuveForm.niveau_min) || 2000
      const payload = {
        tenant_id: companyId,
        company_id: companyId,
        sector_slug: cleanSlug,
        code: cuveForm.code || `CUVE-${cuves.length + 1}`,
        nom: cuveForm.nom,
        produit: cuveForm.produit,
        fuel_type: cuveForm.produit,
        capacite: capVal,
        capacite_totale: capVal,
        capacity_liters: capVal,
        stock_initial: stockVal,
        stock_actuel: stockVal,
        stock_theorique: stockVal,
        current_volume_liters: stockVal,
        niveau_min: minVal,
        min_alert_liters: minVal,
        statut: 'ACTIF'
      }
      const { error } = await safeStationInsert(supabase, 'station_cuves', payload)
      if (error) throw error
      notify('success', 'Cuve enregistrée avec succès')
      setShowCuveModal(false)
      loadAll()
    } catch (err: any) {
      notify('error', err.message || 'Erreur lors de la création de la cuve')
    }
  }

  // ─── Actions : Ajouter une Pompe ─────────────────────────────────────────
  const handleSavePompe = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pompeForm.numero_pompe) return notify('error', 'Numéro de pompe requis')
    try {
      const cleanSlug = sectorSlug || 'station-service'
      const cuveTrouvee = cuves.find(c => c.id === pompeForm.cuve_id)
      const payload = {
        company_id: companyId,
        sector_slug: cleanSlug,
        numero_pompe: pompeForm.numero_pompe,
        type_carburant: pompeForm.type_carburant,
        cuve_id: pompeForm.cuve_id || null,
        cuve_associee: cuveTrouvee ? cuveTrouvee.nom : null,
        index_actuel: Number(pompeForm.index_actuel) || 0,
        statut: 'ACTIVE'
      }
      const { data: newPompe, error } = await safeStationInsert(supabase, 'station_pompes', { ...payload, tenant_id: companyId })
      if (error) throw error

      // Synchronisation vers station_pistolets pour compatibilité et réactivité immédiate
      try {
        const prixDefaut = pompeForm.type_carburant === 'Gasoil' ? 700 : pompeForm.type_carburant?.includes('Pétrole') ? 650 : 680
        await supabase.from('station_pistolets').insert({
          company_id: companyId,
          sector_slug: cleanSlug,
          pompe_id: newPompe?.id || null,
          numero_pompe: pompeForm.numero_pompe,
          code_pistolet: `P-${pompeForm.numero_pompe}`,
          produit: pompeForm.type_carburant,
          cuve_id: pompeForm.cuve_id || null,
          cuve_nom: cuveTrouvee ? cuveTrouvee.nom : null,
          compteur_index: Number(pompeForm.index_actuel) || 0,
          prix_actuel: prixDefaut,
          statut: 'ACTIF'
        })
      } catch {
        // Table optionnelle selon schéma
      }

      notify('success', 'Pompe ajoutée et reliée à la cuve avec succès')
      setShowPompeModal(false)
      loadAll()
    } catch (err: any) {
      notify('error', err.message || 'Erreur lors de la création de la pompe')
    }
  }

  // ─── Actions : Enregistrer un Jaugeage ───────────────────────────────────
  const handleSaveJauge = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!jaugeForm.cuve_id) return notify('error', 'Veuillez sélectionner une cuve')
    try {
      const cleanSlug = sectorSlug || 'station-service'
      const targetCuve = cuves.find(c => c.id === jaugeForm.cuve_id)
      if (!targetCuve) return

      const volMesure = Number(jaugeForm.volume_mesure) || 0
      const stockTheorique = targetCuve.stock_actuel || 0
      const ecart = volMesure - stockTheorique // Négatif = perte / coulage

      const payload = {
        company_id: companyId,
        sector_slug: cleanSlug,
        cuve_id: targetCuve.id,
        cuve_nom: targetCuve.nom,
        produit: targetCuve.produit,
        date_jaugeage: jaugeForm.date_jaugeage,
        heure_jaugeage: new Date().toTimeString().slice(0, 5),
        hauteur_cm: Number(jaugeForm.hauteur_cm) || 0,
        volume_mesure: volMesure,
        stock_theorique_avant: stockTheorique,
        ecart_volume: ecart,
        temperature: Number(jaugeForm.temperature) || 28,
        agent_nom: jaugeForm.agent_nom || 'Responsable',
        observation: jaugeForm.observation,
        valide: true
      }

      const { error } = await safeStationInsert(supabase, 'station_jaugeages', { ...payload, tenant_id: companyId })
      if (error) throw error

      // Mettre à jour le stock physique de la cuve
      await supabase
        .from('station_cuves')
        .update({ stock_actuel: volMesure, updated_at: new Date().toISOString() })
        .eq('id', targetCuve.id)

      notify('success', `Jaugeage enregistré. Écart constaté : ${ecart >= 0 ? '+' : ''}${fmtVol(ecart)}`)
      setShowJaugeModal(false)
      loadAll()
    } catch (err: any) {
      notify('error', err.message || 'Erreur lors du jaugeage')
    }
  }

  // ─── Actions : Enregistrer une Réception Citerne ─────────────────────────
  const handleSaveReception = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!receptionForm.cuve_id) return notify('error', 'Veuillez sélectionner la cuve destinataire')
    const targetCuve = cuves.find(c => c.id === receptionForm.cuve_id)
    if (!targetCuve) return notify('error', 'Cuve introuvable')

    const nomFournisseur = (receptionForm.fournisseur_nom || '').trim()
    if (!nomFournisseur) return notify('error', 'Le nom du fournisseur ou dépôt est requis')

    try {
      const cleanSlug = sectorSlug || 'station-service'
      const qteFacturee = Number(receptionForm.quantite_facturee) || 0
      const qteRecue = Number(receptionForm.quantite_recue) || 0
      const qteCommandee = Number(receptionForm.quantite_commandee) || qteFacturee
      const ecart = qteRecue - qteFacturee
      const prixLitreTTC = Number(receptionForm.prix_achat_litre) || 0
      const fraisTransport = Number(receptionForm.frais_transport) || 0

      // Décomposition fiscale rigoureuse (sans double TVA)
      // Le prix saisi est TTC par défaut
      const isTaxable = receptionForm.is_tva_applicable
      const tauxTva = isTaxable ? (Number(receptionForm.taux_tva) || 18) : 0
      const totalCarburantTTC = qteRecue * prixLitreTTC
      const montantHT = isTaxable && tauxTva > 0
        ? Math.round((totalCarburantTTC / (1 + tauxTva / 100)) * 100) / 100
        : totalCarburantTTC
      const montantTVA = isTaxable && tauxTva > 0
        ? Math.round((totalCarburantTTC - montantHT) * 100) / 100
        : 0
      const puHT = isTaxable && tauxTva > 0
        ? Math.round((prixLitreTTC / (1 + tauxTva / 100)) * 100) / 100
        : prixLitreTTC
      const montantTotal = totalCarburantTTC + fraisTransport

      const refNum = receptionForm.numero_bl
        ? `BL-${receptionForm.numero_bl}`
        : receptionForm.numero_facture
          ? `FAC-${receptionForm.numero_facture}`
          : `REC-${Date.now().toString().slice(-6)}`

      const payload = {
        company_id: companyId,
        sector_slug: cleanSlug,
        reference: refNum,
        fournisseur_id: receptionForm.fournisseur_id || null,
        fournisseur_nom: nomFournisseur,
        numero_bl: receptionForm.numero_bl,
        numero_facture: receptionForm.numero_facture,
        numero_bc: receptionForm.numero_bc,
        date_reception: receptionForm.date_reception,
        produit: targetCuve.produit,
        cuve_id: targetCuve.id,
        cuve_nom: targetCuve.nom,
        quantite_commandee: qteCommandee,
        quantite_facturee: qteFacturee,
        quantite_recue: qteRecue,
        ecart_livraison: ecart,
        prix_achat_litre: prixLitreTTC,
        prix_achat_ht: puHT,
        is_tva_applicable: isTaxable,
        taux_tva: tauxTva,
        montant_ht: montantHT,
        montant_tva: montantTVA,
        frais_transport: fraisTransport,
        montant_total: montantTotal,
        numero_camion: receptionForm.numero_camion,
        chauffeur: receptionForm.chauffeur,
        statut: ecart !== 0 ? 'AVEC_ECART' : 'VALIDE',
        observation: receptionForm.observation
      }

      const { error } = await safeStationInsert(supabase, 'station_receptions_carburant', { ...payload, tenant_id: companyId })
      if (error) throw error

      // Augmentation du stock dans la cuve UNIQUEMENT après validation effective
      const stockAvant = targetCuve.stock_actuel || 0
      const nouveauStock = stockAvant + qteRecue
      await supabase
        .from('station_cuves')
        .update({ stock_actuel: nouveauStock, stock_theorique: nouveauStock, updated_at: new Date().toISOString() })
        .eq('id', targetCuve.id)

      // Traçabilité mouvement de cuve
      try {
        await safeStationInsert(supabase, 'station_mouvements_cuves', {
          company_id: companyId,
          sector_slug: cleanSlug,
          cuve_id: targetCuve.id,
          type_mouvement: 'RECEPTION_CITERNE',
          quantite: qteRecue,
          stock_avant: stockAvant,
          stock_apres: nouveauStock,
          reference: refNum,
          description: `Réception citerne ${nomFournisseur} (+${fmtVol(qteRecue)} ${targetCuve.produit})`
        })
      } catch (mErr) {
        console.warn('Mouvement cuve log notice:', mErr)
      }

      notify('success', `Réception validée : +${fmtVol(qteRecue)} dans ${targetCuve.nom} (${fmt(montantTotal)} FCFA)`)
      setShowReceptionModal(false)
      loadAll()
    } catch (err: any) {
      notify('error', err.message || 'Erreur lors de la réception')
    }
  }

  // Calculs globaux
  const totalCapacite = cuves.reduce((s, c) => s + Number(c.capacite || 0), 0)
  const totalStock = cuves.reduce((s, c) => s + Number(c.stock_actuel || 0), 0)
  const tauxRemplissage = totalCapacite > 0 ? Math.round((totalStock / totalCapacite) * 100) : 0

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* ─── En-tête ─── */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-orange-100 text-orange-700 rounded-2xl">
            <Fuel className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Gestion des Pompes & Cuves</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Supervision des cuves de stockage, relèves d'index pompes, jaugeages et réceptions citernes
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowDailySheet(true)}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm"
          >
            <FileText className="w-4 h-4 text-amber-400" /> Fiche Journalière
          </button>
          <button
            onClick={loadAll}
            disabled={loading}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
            title="Actualiser"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-orange-600' : ''}`} />
          </button>
          {activeTab === 'cuves' && (
            <button
              onClick={() => setShowCuveModal(true)}
              className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4" /> Nouvelle Cuve
            </button>
          )}
          {activeTab === 'pompes' && (
            <button
              onClick={() => setShowPompeModal(true)}
              className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4" /> Nouvelle Pompe
            </button>
          )}
          {activeTab === 'jaugeages' && (
            <button
              onClick={() => setShowJaugeModal(true)}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm"
            >
              <Gauge className="w-4 h-4" /> Contrôle Jaugeage
            </button>
          )}
          {activeTab === 'receptions' && (
            <button
              onClick={() => setShowReceptionModal(true)}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm"
            >
              <Truck className="w-4 h-4" /> Réception Citerne
            </button>
          )}
        </div>
      </div>

      {/* ─── Indicateurs Express ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cuves Opérationnelles</p>
          <p className="text-2xl font-black text-slate-900 font-mono mt-2">{cuves.length}</p>
          <p className="text-[11px] text-slate-400 mt-1">Capacité totale : {fmtVol(totalCapacite)}</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Stock Total Carburant</p>
          <p className="text-2xl font-black text-orange-600 font-mono mt-2">{fmtVol(totalStock)}</p>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
            <div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, tauxRemplissage)}%` }} />
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{tauxRemplissage}% de remplissage</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pompes Actives</p>
          <p className="text-2xl font-black text-slate-900 font-mono mt-2">{pompes.filter(p => p.statut === 'ACTIVE').length} / {pompes.length}</p>
          <p className="text-[11px] text-emerald-600 font-bold mt-1">Distribution en direct</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Alertes Niveaux Bas</p>
          <p className="text-2xl font-black text-rose-600 font-mono mt-2">
            {cuves.filter(c => Number(c.stock_actuel) <= Number(c.niveau_min)).length}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Seuil minimal atteint</p>
        </div>
      </div>

      {/* ─── Barre d'onglets ─── */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('cuves')}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'cuves' ? 'border-orange-600 text-orange-700 bg-orange-50/50 rounded-t-2xl' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Database className="w-4 h-4" /> Cuves de Stockage ({cuves.length})
        </button>

        <button
          onClick={() => setActiveTab('pompes')}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'pompes' ? 'border-orange-600 text-orange-700 bg-orange-50/50 rounded-t-2xl' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Fuel className="w-4 h-4" /> Pompes & Compteurs ({pompes.length})
        </button>

        <button
          onClick={() => setActiveTab('jaugeages')}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'jaugeages' ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-2xl' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Gauge className="w-4 h-4" /> Contrôles Jaugeages ({jaugeages.length})
        </button>

        <button
          onClick={() => setActiveTab('receptions')}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'receptions' ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-2xl' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Truck className="w-4 h-4" /> Réceptions Carburant ({receptions.length})
        </button>

        <button
          onClick={() => setActiveTab('tarifs')}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'tarifs' ? 'border-amber-600 text-amber-700 bg-amber-50/50 rounded-t-2xl' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <DollarSign className="w-4 h-4" /> Paramètres Commerciaux & Fiscaux
        </button>
      </div>

      {/* ─── ONGLET 1 : CUVES DE STOCKAGE ─── */}
      {activeTab === 'cuves' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cuves.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-white rounded-3xl border border-slate-200 p-8">
              <Database className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="font-bold text-slate-700">Aucune cuve enregistrée</p>
              <p className="text-xs text-slate-400 mt-1 mb-4">Initialisez vos cuves pour suivre les stocks réels et les jaugeages.</p>
              <button
                onClick={() => setShowCuveModal(true)}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold shadow-sm"
              >
                + Ajouter la première cuve
              </button>
            </div>
          ) : (
            cuves.map((c) => {
              const rempli = c.capacite > 0 ? Math.round((c.stock_actuel / c.capacite) * 100) : 0
              const isAlert = Number(c.stock_actuel) <= Number(c.niveau_min)

              return (
                <div key={c.id} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="p-2 bg-slate-100 text-slate-700 rounded-xl font-mono text-xs font-bold">
                          {c.code}
                        </span>
                        <h3 className="font-black text-slate-900 text-base">{c.nom}</h3>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                        isAlert ? 'bg-rose-100 text-rose-800 animate-pulse' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {isAlert ? 'NIVEAU CRITIQUE' : 'NORMAL'}
                      </span>
                    </div>

                    <p className="text-xs font-bold text-orange-600 mt-1">{c.produit}</p>

                    {/* Niveau visuel cuve */}
                    <div className="my-5">
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-slate-500">Volume disponible</span>
                        <span className="text-slate-900 font-mono">{fmtVol(c.stock_actuel)} / {fmtVol(c.capacite)}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-2xl h-4 p-0.5 border border-slate-200 overflow-hidden">
                        <div
                          className={`h-full rounded-xl transition-all duration-500 ${
                            rempli < 15 ? 'bg-rose-500' : rempli < 30 ? 'bg-amber-500' : 'bg-gradient-to-r from-orange-500 to-amber-400'
                          }`}
                          style={{ width: `${Math.min(100, rempli)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                        <span>Alerte min : {fmtVol(c.niveau_min)}</span>
                        <span className="font-bold text-slate-700">{rempli}% rempli</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Théorique : {fmtVol(c.stock_theorique || c.stock_actuel)}</span>
                    <button
                      onClick={() => {
                        setJaugeForm(prev => ({ ...prev, cuve_id: c.id }))
                        setShowJaugeModal(true)
                      }}
                      className="text-blue-600 font-bold hover:underline"
                    >
                      Jauger cette cuve
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ─── ONGLET 2 : POMPES & COMPTEURS ─── */}
      {activeTab === 'pompes' && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm">Parc de Pompes de Distribution</h3>
            <span className="text-xs text-slate-400">{pompes.length} pompe(s) enregistrée(s)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase">
                <tr>
                  <th className="p-3">N° Pompe</th>
                  <th className="p-3">Carburant Distribué</th>
                  <th className="p-3">Cuve Raccordée</th>
                  <th className="p-3 text-right">Index Actuel Compteur</th>
                  <th className="p-3 text-center">Statut</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pompes.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-black text-slate-900">{p.numero_pompe}</td>
                    <td className="p-3 font-bold text-orange-600">{p.type_carburant}</td>
                    <td className="p-3 text-slate-600">{p.cuve_associee || '—'}</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-800">{fmtVol(p.index_actuel)}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        p.statut === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {p.statut}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={async () => {
                          const nouvelIndex = await showPrompt(
                            `Nouvel index pour ${p.numero_pompe} (actuel : ${p.index_actuel}) :`,
                            String(p.index_actuel || ''),
                            'Ajustement d\'index pompe'
                          )
                          if (nouvelIndex && !isNaN(Number(nouvelIndex))) {
                            await supabase
                              .from('station_pompes')
                              .update({ index_actuel: Number(nouvelIndex) })
                              .eq('id', p.id)
                            notify('success', 'Index mis à jour')
                            loadAll()
                          }
                        }}
                        className="text-xs text-orange-600 font-bold hover:underline"
                      >
                        Ajuster Index
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── ONGLET 3 : CONTRÔLES JAUGEAGES ─── */}
      {activeTab === 'jaugeages' && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm">Historique des Jaugeages Physiques</h3>
            <span className="text-xs text-slate-400">Contrôle physique vs Stock théorique</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase">
                <tr>
                  <th className="p-3">Date & Heure</th>
                  <th className="p-3">Cuve</th>
                  <th className="p-3">Produit</th>
                  <th className="p-3 text-right">Hauteur (cm)</th>
                  <th className="p-3 text-right">Stock Jaugé (Réel)</th>
                  <th className="p-3 text-right">Stock Théorique</th>
                  <th className="p-3 text-right">Écart Constaté</th>
                  <th className="p-3">Agent</th>
                  <th className="p-3">Observation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jaugeages.map(j => {
                  const ecart = Number(j.ecart_volume || 0)
                  return (
                    <tr key={j.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 whitespace-nowrap text-slate-600">
                        {j.date_jaugeage} {j.heure_jaugeage && `à ${j.heure_jaugeage.slice(0, 5)}`}
                      </td>
                      <td className="p-3 font-bold text-slate-900">{j.cuve_nom}</td>
                      <td className="p-3 text-orange-600 font-bold">{j.produit}</td>
                      <td className="p-3 text-right font-mono">{j.hauteur_cm ? `${j.hauteur_cm} cm` : '—'}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">{fmtVol(j.volume_mesure)}</td>
                      <td className="p-3 text-right font-mono text-slate-500">{fmtVol(j.stock_theorique_avant)}</td>
                      <td className={`p-3 text-right font-mono font-black ${
                        ecart < 0 ? 'text-rose-600' : ecart > 0 ? 'text-blue-600' : 'text-emerald-600'
                      }`}>
                        {ecart > 0 ? '+' : ''}{fmtVol(ecart)}
                      </td>
                      <td className="p-3 text-slate-600">{j.agent_nom || '—'}</td>
                      <td className="p-3 text-slate-400 max-w-xs truncate">{j.observation || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── ONGLET 4 : RÉCEPTIONS CARBURANT ─── */}
      {activeTab === 'receptions' && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm">Dépotages Citernes & Rapprochement Fournisseur</h3>
            <span className="text-xs text-slate-400">Contrôle des volumes reçus</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase">
                <tr>
                  <th className="p-3">Réf / Date</th>
                  <th className="p-3">Fournisseur</th>
                  <th className="p-3">Cuve Destinataire</th>
                  <th className="p-3 text-right">Qté Facturée</th>
                  <th className="p-3 text-right">Qté Réellement Reçue</th>
                  <th className="p-3 text-right">Écart Livraison</th>
                  <th className="p-3 text-right">Prix Achat</th>
                  <th className="p-3 text-right">Total FCFA</th>
                  <th className="p-3">Camion / Chauffeur</th>
                  <th className="p-3 text-center">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receptions.map(r => {
                  const ecart = Number(r.ecart_livraison || 0)
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-900">{r.reference}</span>
                        <div className="text-[10px] text-slate-400">{r.date_reception}</div>
                      </td>
                      <td className="p-3 font-bold text-slate-700">{r.fournisseur_nom}</td>
                      <td className="p-3 text-orange-600 font-bold">{r.cuve_nom}</td>
                      <td className="p-3 text-right font-mono text-slate-600">{fmtVol(r.quantite_facturee)}</td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-700">{fmtVol(r.quantite_recue)}</td>
                      <td className={`p-3 text-right font-mono font-black ${
                        ecart < 0 ? 'text-rose-600' : ecart > 0 ? 'text-blue-600' : 'text-slate-400'
                      }`}>
                        {ecart > 0 ? '+' : ''}{fmtVol(ecart)}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-600">{fmt(r.prix_achat_litre)} F</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">{fmt(r.montant_total)} F</td>
                      <td className="p-3 text-slate-500">{r.numero_camion || '—'} {r.chauffeur && `(${r.chauffeur})`}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          r.statut === 'AVEC_ECART' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {r.statut}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── ONGLET 5 : PARAMÈTRES COMMERCIAUX & FISCAUX ─── */}
      {activeTab === 'tarifs' && (
        <StationFuelPricingTab
          companyId={companyId || ''}
          company={company}
          user={user}
          isAdmin={isAdmin}
          onPriceUpdated={loadAll}
        />
      )}

      {/* ─── MODALE NOUVELLE CUVE ─── */}
      {showCuveModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-black text-slate-900 text-base">Ajouter une Cuve de Stockage</h2>
              <button onClick={() => setShowCuveModal(false)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveCuve} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700">Code / Réf</label>
                <input
                  type="text"
                  placeholder="Ex: CUVE-01"
                  value={cuveForm.code}
                  onChange={e => setCuveForm({ ...cuveForm, code: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700">Nom de la cuve *</label>
                <input
                  type="text"
                  placeholder="Ex: Cuve Super 01"
                  required
                  value={cuveForm.nom}
                  onChange={e => setCuveForm({ ...cuveForm, nom: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700">Produit contenu</label>
                <select
                  value={cuveForm.produit}
                  onChange={e => setCuveForm({ ...cuveForm, produit: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-bold text-slate-800"
                >
                  <option value="Essence Super">Essence Super</option>
                  <option value="Gasoil">Gasoil</option>
                  <option value="Pétrole Lampant">Pétrole Lampant</option>
                  <option value="GPL">GPL</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Capacité totale (L)</label>
                  <input
                    type="number"
                    value={cuveForm.capacite}
                    onChange={e => setCuveForm({ ...cuveForm, capacite: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Stock initial (L)</label>
                  <input
                    type="number"
                    value={cuveForm.stock_actuel}
                    onChange={e => setCuveForm({ ...cuveForm, stock_actuel: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-mono text-orange-600 font-bold"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700">Seuil d'alerte minimale (L)</label>
                <input
                  type="number"
                  value={cuveForm.niveau_min}
                  onChange={e => setCuveForm({ ...cuveForm, niveau_min: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-mono text-rose-600"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setShowCuveModal(false)} className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold shadow-sm">Enregistrer la cuve</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODALE NOUVELLE POMPE ─── */}
      {showPompeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-black text-slate-900 text-base">Ajouter une Pompe</h2>
              <button onClick={() => setShowPompeModal(false)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSavePompe} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700">Numéro / Désignation *</label>
                <input
                  type="text"
                  placeholder="Ex: Pompe 01 - Piste A"
                  required
                  value={pompeForm.numero_pompe}
                  onChange={e => setPompeForm({ ...pompeForm, numero_pompe: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700">Cuve raccordée</label>
                <select
                  value={pompeForm.cuve_id}
                  onChange={e => {
                    const sel = cuves.find(c => c.id === e.target.value)
                    setPompeForm({
                      ...pompeForm,
                      cuve_id: e.target.value,
                      type_carburant: sel ? sel.produit : pompeForm.type_carburant
                    })
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-bold text-slate-800"
                >
                  <option value="">— Sélectionner une cuve —</option>
                  {cuves.map(c => (
                    <option key={c.id} value={c.id}>{c.nom} ({c.produit})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700">Carburant</label>
                <input
                  type="text"
                  value={pompeForm.type_carburant}
                  onChange={e => setPompeForm({ ...pompeForm, type_carburant: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 text-orange-600 font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700">Index actuel du compteur (Litres)</label>
                <input
                  type="number"
                  step="0.001"
                  value={pompeForm.index_actuel}
                  onChange={e => setPompeForm({ ...pompeForm, index_actuel: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-mono font-bold"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setShowPompeModal(false)} className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold shadow-sm">Créer la pompe</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODALE CONTRÔLE JAUGEAGE ─── */}
      {showJaugeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-black text-slate-900 text-base flex items-center gap-2">
                <Gauge className="w-5 h-5 text-blue-600" /> Saisie Contrôle Jaugeage
              </h2>
              <button onClick={() => setShowJaugeModal(false)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveJauge} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700">Cuve contrôlée *</label>
                <select
                  required
                  value={jaugeForm.cuve_id}
                  onChange={e => setJaugeForm({ ...jaugeForm, cuve_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-bold text-slate-800"
                >
                  <option value="">— Choisir la cuve —</option>
                  {cuves.map(c => (
                    <option key={c.id} value={c.id}>{c.nom} ({c.produit}) — Stock théorique : {fmtVol(c.stock_actuel)}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Hauteur à la jauge (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Ex: 145.5"
                    value={jaugeForm.hauteur_cm}
                    onChange={e => setJaugeForm({ ...jaugeForm, hauteur_cm: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Volume Physique Jaugé (L) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Ex: 18450"
                    value={jaugeForm.volume_mesure}
                    onChange={e => setJaugeForm({ ...jaugeForm, volume_mesure: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-mono font-black text-blue-700"
                  />
                </div>
              </div>

              {/* Aperçu écart instantané */}
              {jaugeForm.cuve_id && (
                (() => {
                  const target = cuves.find(c => c.id === jaugeForm.cuve_id)
                  const th = target ? target.stock_actuel : 0
                  const ecart = Number(jaugeForm.volume_mesure) - th
                  return (
                    <div className={`p-3 rounded-2xl border text-xs flex items-center justify-between ${
                      ecart < 0 ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    }`}>
                      <div>
                        <span className="font-bold">Écart calculé instantanément :</span>
                        <div className="text-[11px] text-slate-600">Théorique {fmtVol(th)} vs Jaugé {fmtVol(jaugeForm.volume_mesure)}</div>
                      </div>
                      <span className="font-mono text-base font-black">
                        {ecart > 0 ? '+' : ''}{fmtVol(ecart)}
                      </span>
                    </div>
                  )
                })()
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Date du jaugeage</label>
                  <input
                    type="date"
                    value={jaugeForm.date_jaugeage}
                    onChange={e => setJaugeForm({ ...jaugeForm, date_jaugeage: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Agent de contrôle</label>
                  <input
                    type="text"
                    placeholder="Nom du contrôleur"
                    value={jaugeForm.agent_nom}
                    onChange={e => setJaugeForm({ ...jaugeForm, agent_nom: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Observation / Motif éventuel</label>
                <textarea
                  rows={2}
                  placeholder="Justification en cas d'écart significatif…"
                  value={jaugeForm.observation}
                  onChange={e => setJaugeForm({ ...jaugeForm, observation: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setShowJaugeModal(false)} className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm">Valider le Jaugeage</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODALE RÉCEPTION CITERNE ─── */}
      {showReceptionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-black text-slate-900 text-base flex items-center gap-2">
                  <Truck className="w-5 h-5 text-emerald-600" /> Réception Citerne & Achat Carburant
                </h2>
                <p className="text-[11px] text-slate-500">
                  Dépotage en cuve, rapprochement BL / Facture et décomposition fiscale réelle
                </p>
              </div>
              <button onClick={() => setShowReceptionModal(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSaveReception} className="space-y-4">
              {/* Fournisseur & Références */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-500" />
                    Fournisseur / Dépôt Pétrolier *
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsManualSupplier(!isManualSupplier)}
                    className="text-[11px] text-orange-600 font-bold hover:underline"
                  >
                    {isManualSupplier ? 'Choisir dans la liste des fournisseurs' : '+ Saisie manuelle / Autre dépôt'}
                  </button>
                </div>

                {!isManualSupplier && suppliers.length > 0 ? (
                  <select
                    required
                    value={receptionForm.fournisseur_id}
                    onChange={(e) => {
                      const selId = e.target.value
                      const sel = suppliers.find(s => s.id === selId)
                      setReceptionForm({
                        ...receptionForm,
                        fournisseur_id: selId,
                        fournisseur_nom: sel?.company_name || receptionForm.fournisseur_nom
                      })
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white font-bold text-slate-800"
                  >
                    <option value="">— Sélectionner le fournisseur enregistré —</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.company_name} {s.phone ? `(${s.phone})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    placeholder="Ex: SONACOP Dépôt Akpakpa, Oryx Energies, TotalEnergies..."
                    value={receptionForm.fournisseur_nom}
                    onChange={e => setReceptionForm({ ...receptionForm, fournisseur_nom: e.target.value, fournisseur_id: '' })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white font-bold"
                  />
                )}

                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600">N° Bon Commande (BC)</label>
                    <input
                      type="text"
                      placeholder="Ex: BC-2026-0042"
                      value={receptionForm.numero_bc}
                      onChange={e => setReceptionForm({ ...receptionForm, numero_bc: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600">N° Bordereau BL *</label>
                    <input
                      type="text"
                      placeholder="Ex: BL-89412"
                      value={receptionForm.numero_bl}
                      onChange={e => setReceptionForm({ ...receptionForm, numero_bl: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-white font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600">N° Facture Fournisseur</label>
                    <input
                      type="text"
                      placeholder="Ex: FAC-45129"
                      value={receptionForm.numero_facture}
                      onChange={e => setReceptionForm({ ...receptionForm, numero_facture: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Cuve destinataire & Détection automatique du produit et tarif */}
              <div>
                <label className="text-xs font-bold text-slate-700">Cuve réceptrice de dépotage *</label>
                <select
                  required
                  value={receptionForm.cuve_id}
                  onChange={e => {
                    const cId = e.target.value
                    const target = cuves.find(c => c.id === cId)
                    if (target) {
                      // Chercher la configuration tarifaire du carburant associé
                      const matchedCfg = fuelConfigs.find(f => {
                        const tProd = (target.produit || '').toLowerCase()
                        const fNom = f.nom.toLowerCase()
                        return fNom === tProd ||
                          (fNom.includes('super') && tProd.includes('super')) ||
                          (fNom.includes('gasoil') && tProd.includes('gasoil')) ||
                          (fNom.includes('pétrole') && (tProd.includes('pétrole') || tProd.includes('petrole')))
                      })

                      const pAchat = matchedCfg ? matchedCfg.prix_achat_reference : (target.produit.toLowerCase().includes('gasoil') ? 640 : 620)
                      const isTax = matchedCfg ? matchedCfg.is_tva_applicable : true
                      const tvaRate = matchedCfg ? matchedCfg.taux_tva : (company?.default_tva_rate ?? 18)

                      setReceptionForm({
                        ...receptionForm,
                        cuve_id: cId,
                        produit: target.produit,
                        prix_achat_litre: pAchat,
                        is_tva_applicable: isTax,
                        taux_tva: tvaRate
                      })
                    } else {
                      setReceptionForm({ ...receptionForm, cuve_id: cId })
                    }
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-bold text-slate-800"
                >
                  <option value="">— Choisir la cuve destinataire —</option>
                  {cuves.map(c => {
                    const restant = Math.max(0, c.capacite - c.stock_actuel)
                    return (
                      <option key={c.id} value={c.id}>
                        {c.nom} ({c.produit}) — Stock actuel : {fmtVol(c.stock_actuel)} / {fmtVol(c.capacite)} (Espace libre : {fmtVol(restant)})
                      </option>
                    )
                  })}
                </select>
              </div>

              {/* Volumes : Commandé, Facturé BL et Réel Dépoté */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Volume Commandé (L)</label>
                  <input
                    type="number"
                    value={receptionForm.quantite_commandee}
                    onChange={e => setReceptionForm({ ...receptionForm, quantite_commandee: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Volume Facturé BL (L) *</label>
                  <input
                    type="number"
                    required
                    value={receptionForm.quantite_facturee}
                    onChange={e => setReceptionForm({ ...receptionForm, quantite_facturee: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Volume Réel Dépoté (L) *</label>
                  <input
                    type="number"
                    required
                    value={receptionForm.quantite_recue}
                    onChange={e => setReceptionForm({ ...receptionForm, quantite_recue: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-mono font-black text-emerald-700"
                  />
                </div>
              </div>

              {/* Rapprochement immédiat de volume */}
              {(() => {
                const ecart = Number(receptionForm.quantite_recue) - Number(receptionForm.quantite_facturee)
                if (ecart !== 0) {
                  return (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs flex items-center justify-between text-amber-900">
                      <span className="font-bold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600" /> Écart de livraison détecté :
                      </span>
                      <span className={`font-mono font-black text-sm ${ecart < 0 ? 'text-rose-600' : 'text-blue-600'}`}>
                        {ecart > 0 ? '+' : ''}{fmtVol(ecart)} ({ecart < 0 ? 'Perte / Manquant transporteur' : 'Excédent livraison'})
                      </span>
                    </div>
                  )
                }
                return null
              })()}

              {/* Prix d'achat, TVA et Frais de transport */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700">
                      Prix d'Achat unitaire au Litre (FCFA TTC) *
                    </label>
                    <input
                      type="number"
                      required
                      value={receptionForm.prix_achat_litre}
                      onChange={e => setReceptionForm({ ...receptionForm, prix_achat_litre: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 bg-white rounded-xl mt-1 font-mono font-bold text-slate-900"
                    />
                    <span className="text-[10px] text-slate-400">Prix unitaire TTC figurant sur la facture fournisseur</span>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700">Frais d'Approche / Transport (FCFA)</label>
                    <input
                      type="number"
                      value={receptionForm.frais_transport}
                      onChange={e => setReceptionForm({ ...receptionForm, frais_transport: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 bg-white rounded-xl mt-1 font-mono"
                      placeholder="0"
                    />
                    <span className="text-[10px] text-slate-400">Incorporés au coût de revient réel</span>
                  </div>
                </div>

                {/* Case à cocher TVA visible immédiatement à côté du libellé TVA */}
                <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="modal_reception_tva_checkbox"
                      checked={receptionForm.is_tva_applicable}
                      onChange={(e) => setReceptionForm({ ...receptionForm, is_tva_applicable: e.target.checked })}
                      className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-slate-300 cursor-pointer"
                    />
                    <label
                      htmlFor="modal_reception_tva_checkbox"
                      className="font-bold text-slate-900 cursor-pointer select-none text-xs flex items-center gap-1.5"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-orange-600" />
                      TVA applicable sur cette livraison
                    </label>
                  </div>

                  {receptionForm.is_tva_applicable ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-600">Taux :</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={receptionForm.taux_tva}
                        onChange={e => setReceptionForm({ ...receptionForm, taux_tva: Number(e.target.value) })}
                        className="w-20 px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white font-bold font-mono"
                      />
                      <span className="text-xs font-bold text-slate-600">%</span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-amber-700 font-medium bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                      Régime exonéré / TPS (Aucun ajout de TVA, HT = TTC)
                    </span>
                  )}
                </div>
              </div>

              {/* Synthèse financière et décomposition fiscale en direct */}
              {(() => {
                const qteRec = Number(receptionForm.quantite_recue) || 0
                const puTtc = Number(receptionForm.prix_achat_litre) || 0
                const fraisTr = Number(receptionForm.frais_transport) || 0
                const isTax = receptionForm.is_tva_applicable
                const tvaRate = isTax ? (Number(receptionForm.taux_tva) || 18) : 0

                const totalCarburantTTC = qteRec * puTtc
                const netHT = isTax && tvaRate > 0
                  ? Math.round((totalCarburantTTC / (1 + tvaRate / 100)) * 100) / 100
                  : totalCarburantTTC
                const tvaAmount = isTax && tvaRate > 0
                  ? Math.round((totalCarburantTTC - netHT) * 100) / 100
                  : 0
                const totalGlobal = totalCarburantTTC + fraisTr
                const coutRevientUnitaire = qteRec > 0 ? Math.round((totalGlobal / qteRec) * 100) / 100 : 0

                return (
                  <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-2 text-xs">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-300">
                      <span className="font-bold flex items-center gap-1.5">
                        <Receipt className="w-4 h-4 text-emerald-400" />
                        Décomposition de la Facturation Fournisseur :
                      </span>
                      <span className="font-mono text-emerald-400 font-bold">{fmtVol(qteRec)}</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Net HT Carburant</span>
                        <span className="font-black text-slate-100">{fmt(netHT)} F</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">TVA Déductible</span>
                        <span className={`font-black ${tvaAmount > 0 ? 'text-blue-400' : 'text-slate-500'}`}>
                          {tvaAmount > 0 ? `${fmt(tvaAmount)} F` : '0 F (Exonéré)'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Frais Approche</span>
                        <span className="font-black text-amber-300">{fmt(fraisTr)} F</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Total TTC Global</span>
                        <span className="font-black text-emerald-400 text-xs">{fmt(totalGlobal)} F</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
                      <span className="text-slate-300">Coût de revient réel unitaire (CUMP de cette livraison) :</span>
                      <span className="font-mono font-black text-amber-300 text-sm">
                        {fmt(coutRevientUnitaire)} FCFA / L
                      </span>
                    </div>
                  </div>
                )
              })()}

              {/* Logistique camion & chauffeur */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Date réception *</label>
                  <input
                    type="date"
                    required
                    value={receptionForm.date_reception}
                    onChange={e => setReceptionForm({ ...receptionForm, date_reception: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-medium"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">N° Camion Citerne</label>
                  <input
                    type="text"
                    placeholder="Ex: RB 4521 AA"
                    value={receptionForm.numero_camion}
                    onChange={e => setReceptionForm({ ...receptionForm, numero_camion: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Chauffeur Citerne</label>
                  <input
                    type="text"
                    placeholder="Nom du chauffeur"
                    value={receptionForm.chauffeur}
                    onChange={e => setReceptionForm({ ...receptionForm, chauffeur: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Observations / Certificat de jaugeage</label>
                <textarea
                  rows={2}
                  placeholder="Notes sur la livraison, densité mesurée, température de dépotage..."
                  value={receptionForm.observation}
                  onChange={e => setReceptionForm({ ...receptionForm, observation: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowReceptionModal(false)}
                  className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  Valider la Réception & Augmenter le Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODALE FICHE JOURNALIÈRE DES CARBURANTS ─── */}
      <StationDailyFuelSheetModal
        isOpen={showDailySheet}
        onClose={() => setShowDailySheet(false)}
        companyId={companyId || ''}
        company={company}
      />
    </div>
  )
}
export default PompesCuvesPage
