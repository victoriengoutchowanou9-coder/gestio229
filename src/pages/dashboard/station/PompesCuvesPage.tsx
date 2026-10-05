// =============================================================================
// GESTIO 229 — Station-Service & Hydrocarbures : Pompes, Cuves, Jaugeages & Réceptions
// =============================================================================
// Isolation absolue : company_id + sector_slug = 'station-service'
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Fuel, Database, Gauge, Truck, Plus, RefreshCw, AlertTriangle, CheckCircle,
  Clock, Calendar, User, Search, ArrowDownRight, ArrowUpRight, Check, X
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'

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
  date_reception: string
  produit: string
  cuve_nom: string
  quantite_facturee: number
  quantite_recue: number
  ecart_livraison: number
  prix_achat_litre: number
  montant_total: number
  numero_camion?: string
  chauffeur?: string
  statut: string
  observation?: string
}

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))
const fmtVol = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n || 0) + ' L'

export const PompesCuvesPage: React.FC = () => {
  const { companyId, sectorSlug } = useTenant()
  const { toast } = useUIStore() as any

  const [activeTab, setActiveTab] = useState<'cuves' | 'pompes' | 'jaugeages' | 'receptions'>('cuves')
  const [loading, setLoading] = useState(true)

  // Données
  const [cuves, setCuves] = useState<Cuve[]>([])
  const [pompes, setPompes] = useState<Pompe[]>([])
  const [jaugeages, setJaugeages] = useState<Jaugeage[]>([])
  const [receptions, setReceptions] = useState<Reception[]>([])

  // Modales
  const [showCuveModal, setShowCuveModal] = useState(false)
  const [showPompeModal, setShowPompeModal] = useState(false)
  const [showJaugeModal, setShowJaugeModal] = useState(false)
  const [showReceptionModal, setShowReceptionModal] = useState(false)

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
    fournisseur_nom: 'SONACOP / Dépôt Akpakpa', date_reception: new Date().toISOString().slice(0, 10),
    produit: 'Essence Super', cuve_id: '', quantite_facturee: 10000, quantite_recue: 10000,
    prix_achat_litre: 600, numero_camion: '', chauffeur: '', observation: ''
  })

  const notify = useCallback((type: 'success' | 'error', msg: string) => {
    try {
      if (toast?.[type]) toast[type](msg)
      else if (type === 'error') window.alert(msg)
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

    } catch (err: any) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [companyId, sectorSlug])

  useEffect(() => { loadAll() }, [loadAll])

  // ─── Actions : Ajouter une Cuve ──────────────────────────────────────────
  const handleSaveCuve = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cuveForm.nom) return notify('error', 'Le nom de la cuve est requis')
    try {
      const cleanSlug = sectorSlug || 'station-service'
      const payload = {
        company_id: companyId,
        sector_slug: cleanSlug,
        code: cuveForm.code || `CUVE-${cuves.length + 1}`,
        nom: cuveForm.nom,
        produit: cuveForm.produit,
        capacite: Number(cuveForm.capacite) || 30000,
        stock_initial: Number(cuveForm.stock_actuel) || 0,
        stock_actuel: Number(cuveForm.stock_actuel) || 0,
        stock_theorique: Number(cuveForm.stock_actuel) || 0,
        niveau_min: Number(cuveForm.niveau_min) || 2000,
        statut: 'ACTIF'
      }
      const { error } = await supabase.from('station_cuves').insert(payload)
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
      const { error } = await supabase.from('station_pompes').insert(payload)
      if (error) throw error
      notify('success', 'Pompe ajoutée avec succès')
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

      const { error } = await supabase.from('station_jaugeages').insert(payload)
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
    try {
      const cleanSlug = sectorSlug || 'station-service'
      const targetCuve = cuves.find(c => c.id === receptionForm.cuve_id)
      if (!targetCuve) return

      const qteFacturee = Number(receptionForm.quantite_facturee) || 0
      const qteRecue = Number(receptionForm.quantite_recue) || 0
      const ecart = qteRecue - qteFacturee
      const prixLitre = Number(receptionForm.prix_achat_litre) || 0
      const total = qteFacturee * prixLitre

      const payload = {
        company_id: companyId,
        sector_slug: cleanSlug,
        fournisseur_nom: receptionForm.fournisseur_nom,
        date_reception: receptionForm.date_reception,
        produit: targetCuve.produit,
        cuve_id: targetCuve.id,
        cuve_nom: targetCuve.nom,
        quantite_commandee: qteFacturee,
        quantite_facturee: qteFacturee,
        quantite_recue: qteRecue,
        ecart_livraison: ecart,
        prix_achat_litre: prixLitre,
        montant_total: total,
        numero_camion: receptionForm.numero_camion,
        chauffeur: receptionForm.chauffeur,
        statut: ecart !== 0 ? 'AVEC_ECART' : 'VALIDE',
        observation: receptionForm.observation
      }

      const { error } = await supabase.from('station_receptions_carburant').insert(payload)
      if (error) throw error

      // Augmentation du stock dans la cuve
      const nouveauStock = (targetCuve.stock_actuel || 0) + qteRecue
      await supabase
        .from('station_cuves')
        .update({ stock_actuel: nouveauStock, stock_theorique: nouveauStock, updated_at: new Date().toISOString() })
        .eq('id', targetCuve.id)

      notify('success', `Réception enregistrée (+${fmtVol(qteRecue)} dans ${targetCuve.nom})`)
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
                          const nouvelIndex = window.prompt(`Nouvel index pour ${p.numero_pompe} (actuel : ${p.index_actuel}) :`)
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
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-black text-slate-900 text-base flex items-center gap-2">
                <Truck className="w-5 h-5 text-emerald-600" /> Réception Citerne Carburant
              </h2>
              <button onClick={() => setShowReceptionModal(false)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveReception} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700">Fournisseur / Dépôt pétrolier *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: SONACOP, TotalEnergies, Oryx..."
                  value={receptionForm.fournisseur_nom}
                  onChange={e => setReceptionForm({ ...receptionForm, fournisseur_nom: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Cuve de dépotage *</label>
                <select
                  required
                  value={receptionForm.cuve_id}
                  onChange={e => setReceptionForm({ ...receptionForm, cuve_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-bold text-slate-800"
                >
                  <option value="">— Choisir la cuve réceptrice —</option>
                  {cuves.map(c => (
                    <option key={c.id} value={c.id}>{c.nom} ({c.produit}) — Reste disponible : {fmtVol(c.capacite - c.stock_actuel)}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
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

              {/* Rapprochement immédiat */}
              {(() => {
                const ecart = Number(receptionForm.quantite_recue) - Number(receptionForm.quantite_facturee)
                if (ecart !== 0) {
                  return (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs flex items-center justify-between text-amber-900">
                      <span className="font-bold flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4 text-amber-600" /> Écart de livraison détecté :
                      </span>
                      <span className="font-mono font-black text-sm text-rose-600">
                        {ecart > 0 ? '+' : ''}{fmtVol(ecart)}
                      </span>
                    </div>
                  )
                }
                return null
              })()}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Prix d'achat au Litre (FCFA)</label>
                  <input
                    type="number"
                    value={receptionForm.prix_achat_litre}
                    onChange={e => setReceptionForm({ ...receptionForm, prix_achat_litre: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Totalité Facturée (FCFA)</label>
                  <div className="px-3 py-2 text-sm border border-slate-200 bg-slate-50 rounded-xl mt-1 font-mono font-black text-slate-900">
                    {fmt(Number(receptionForm.quantite_facturee) * Number(receptionForm.prix_achat_litre))} F
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
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

              <div className="pt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setShowReceptionModal(false)} className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm">Valider la Réception</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
export default PompesCuvesPage
