// =============================================================================
// GESTIO 229 SaaS — Brasserie & Dépôt de Boissons
// MODULE : Gestion des Consignations / Emballages
// Périmètre STRICT : sector_slug = 'brasserie'
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Package, Plus, Search, RefreshCw, Printer, X, Check,
  AlertTriangle, ChevronRight, ArrowDownLeft, ArrowUpRight,
  ClipboardCheck, BarChart3, Users, Layers, History,
  Settings, Edit2, Trash2, FileText, Download, Eye,
  TrendingUp, TrendingDown, ArrowRightLeft, Box
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { useTenant } from '../../../hooks/useTenant'
import { logAuditEvent } from '../../../services/auditService'
import { formatFCFA } from '../../../utils/tax'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)
const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const fmtDateTime = (d: string) => new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface Emballage {
  id: string
  company_id: string
  sector_slug: string
  code: string
  designation: string
  type: string
  unite: string
  valeur_consignation: number
  stock_depot: number
  is_active: boolean
  notes?: string
  created_at: string
  updated_at: string
}

interface Consignation {
  id: string
  client_id: string
  emballage_id: string
  total_sorti: number
  total_retourne: number
  solde_du: number
  derniere_sortie?: string
  dernier_retour?: string
  // joined
  client?: { id: string; name: string; phone?: string; code?: string }
  emballage?: Emballage
}

interface MouvementEmballage {
  id: string
  emballage_id: string
  client_id?: string
  type_mouvement: string
  quantite: number
  reference?: string
  vente_id?: string
  ajustement_motif?: string
  stock_depot_avant?: number
  stock_depot_apres?: number
  solde_client_avant?: number
  solde_client_apres?: number
  notes?: string
  created_by_name?: string
  created_at: string
  // joined
  emballage?: Emballage
  client?: { name: string }
}

interface InventaireSession {
  id: string
  reference: string
  date_inventaire: string
  statut: string
  notes?: string
  valide_par_name?: string
  valide_at?: string
  created_by_name?: string
  created_at: string
}

interface ClientSolde {
  client_id: string
  client_name: string
  client_phone?: string
  client_code?: string
  soldes: Record<string, { emballage: Emballage; total_sorti: number; total_retourne: number; solde_du: number }>
  total_emballages_dus: number
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type TabId = 'initiale' | 'fournisseur' | 'clients' | 'dashboard' | 'emballages' | 'retours' | 'historique' | 'inventaire' | 'ajustements'

const TABS: { id: TabId; label: string; icon: React.FC<any> }[] = [
  { id: 'initiale', label: '1. Situation Initiale', icon: Layers },
  { id: 'fournisseur', label: '2. Stock Fournisseur', icon: Box },
  { id: 'clients', label: '3. Situation Actuelle', icon: Users },
  { id: 'dashboard', label: 'Tableau de Bord', icon: BarChart3 },
  { id: 'emballages', label: 'Emballages Types', icon: Box },
  { id: 'retours', label: 'Retours', icon: ArrowDownLeft },
  { id: 'historique', label: 'Historique', icon: History },
  { id: 'inventaire', label: 'Inventaire', icon: ClipboardCheck },
  { id: 'ajustements', label: 'Ajustements', icon: Settings },
]

// Lucide Minus icon
const Minus: React.FC<any> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="5" y1="12" x2="19" y2="12" /></svg>
)

// ─── Type mouvement label ──────────────────────────────────────────────────────

const MOUVEMENT_LABELS: Record<string, { label: string; color: string; bg: string; icon: React.FC<any> }> = {
  SORTIE_VENTE:       { label: 'Sortie Vente',       color: 'text-red-700',    bg: 'bg-red-50',    icon: ArrowUpRight },
  RETOUR_IMMEDIAT:    { label: 'Retour Immédiat',    color: 'text-blue-700',   bg: 'bg-blue-50',   icon: ArrowDownLeft },
  RETOUR_CLIENT:      { label: 'Retour Client',      color: 'text-emerald-700',bg: 'bg-emerald-50',icon: ArrowDownLeft },
  AJUSTEMENT_ENTREE:  { label: 'Ajust. Entrée',      color: 'text-violet-700', bg: 'bg-violet-50', icon: Plus },
  AJUSTEMENT_SORTIE:  { label: 'Ajust. Sortie',      color: 'text-orange-700', bg: 'bg-orange-50', icon: Minus },
  INVENTAIRE:         { label: 'Inventaire',          color: 'text-slate-700',  bg: 'bg-slate-50',  icon: ClipboardCheck },
  AVOIR_RETOUR:       { label: 'Avoir/Retour',        color: 'text-teal-700',   bg: 'bg-teal-50',   icon: ArrowRightLeft },
}

// ─── Composant principal ───────────────────────────────────────────────────────

const BrasserieConsignationPage: React.FC = () => {
  const { companyId, sectorSlug, user, isAdmin } = useTenant()
  const toast = useUIStore((s) => s.toast)

  // ── Guards ────────────────────────────────────────────────────────────────
  if (sectorSlug !== 'brasserie') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-8 bg-amber-50 rounded-2xl border border-amber-200 max-w-md">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-800 mb-2">Module réservé à la Brasserie</h2>
          <p className="text-sm text-slate-500">Ce module est exclusif au secteur "Brasserie & Dépôt de Boissons".</p>
        </div>
      </div>
    )
  }

  // ── State ─────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>('initiale')
  const [loading, setLoading] = useState(true)
  const [emballages, setEmballages] = useState<Emballage[]>([])
  const [consignations, setConsignations] = useState<Consignation[]>([])
  const [mouvements, setMouvements] = useState<MouvementEmballage[]>([])
  const [inventaires, setInventaires] = useState<InventaireSession[]>([])

  // Situation Initiale Clients (M046 - Rubrique demandée)
  const [initialeClientsList, setInitialeClientsList] = useState<{ id: string; name: string; phone?: string; code?: string }[]>([])
  const [initialeClientId, setInitialeClientId] = useState('')
  const [initialePrecedents, setInitialePrecedents] = useState<Record<string, number>>({})
  const [initialeObservation, setInitialeObservation] = useState('')
  const [savingInitiale, setSavingInitiale] = useState(false)

  // Stock Fournisseur (M046 - Plein / Vide)
  const [stockFournisseurs, setStockFournisseurs] = useState<{ id?: string; fournisseur: string; emballage_id: string; type_stock: 'plein' | 'vide'; quantite: number; date_initiale?: string; emballage?: Emballage }[]>([])
  const [fFournisseur, setFFournisseur] = useState({
    fournisseur: 'SOBEBRA',
    emballage_id: '',
    type_stock: 'plein' as 'plein' | 'vide',
    quantite: '',
  })
  const [savingFournisseur, setSavingFournisseur] = useState(false)

  // Filtres
  const [searchClient, setSearchClient] = useState('')
  const [filterEmballage, setFilterEmballage] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [filterDateDebut, setFilterDateDebut] = useState('')
  const [filterDateFin, setFilterDateFin] = useState('')

  // Modals
  const [modalEmballage, setModalEmballage] = useState(false)
  const [modalRetour, setModalRetour] = useState(false)
  const [modalInventaire, setModalInventaire] = useState(false)
  const [modalAjustement, setModalAjustement] = useState(false)
  const [editingEmballage, setEditingEmballage] = useState<Emballage | null>(null)
  const [detailClient, setDetailClient] = useState<ClientSolde | null>(null)

  // Form emballage
  const [fEmb, setFEmb] = useState({ code: '', designation: '', type: 'casier', unite: 'unité', valeur_consignation: '0', stock_depot: '0', notes: '' })

  // Form retour
  const [fRetour, setFRetour] = useState({
    client_id: '',
    emballage_id: '',
    quantite: '',
    date: new Date().toISOString().slice(0, 10),
    reference: '',
    notes: '',
  })
  const [retourClients, setRetourClients] = useState<{ id: string; name: string; phone?: string }[]>([])
  const [retourSituationAvant, setRetourSituationAvant] = useState<Consignation[]>([])

  // Form ajustement
  const [fAjust, setFAjust] = useState({
    emballage_id: '',
    type: 'AJUSTEMENT_ENTREE' as 'AJUSTEMENT_ENTREE' | 'AJUSTEMENT_SORTIE',
    quantite: '',
    motif: '',
  })

  // Form inventaire
  const [invLignes, setInvLignes] = useState<{ emballage_id: string; stock_theorique: number; stock_physique: string; observation: string }[]>([])

  // Impression
  const [printingBonRetour, setPrintingBonRetour] = useState<{ mouvement: MouvementEmballage; avant: number; apres: number } | null>(null)

  // ── Chargement data ────────────────────────────────────────────────────────

  const loadEmballages = useCallback(async () => {
    if (!companyId) return
    const { data } = await supabase
      .from('brasserie_emballages')
      .select('*')
      .eq('company_id', companyId)
      .eq('sector_slug', 'brasserie')
      .eq('is_active', true)
      .order('code')
    setEmballages(data || [])
  }, [companyId])

  const loadConsignations = useCallback(async () => {
    if (!companyId) return
    const { data } = await supabase
      .from('brasserie_consignations')
      .select(`
        *,
        client:customers(id, name, phone, code),
        emballage:brasserie_emballages(*)
      `)
      .eq('company_id', companyId)
      .eq('sector_slug', 'brasserie')
      .gt('total_sorti', 0)
      .order('updated_at', { ascending: false })
    setConsignations(data || [])
  }, [companyId])

  const loadMouvements = useCallback(async () => {
    if (!companyId) return
    let q = supabase
      .from('brasserie_mouvements_emballages')
      .select(`
        *,
        emballage:brasserie_emballages(code, designation),
        client:customers(name)
      `)
      .eq('company_id', companyId)
      .eq('sector_slug', 'brasserie')
      .order('created_at', { ascending: false })
      .limit(200)
    if (filterDateDebut) q = q.gte('created_at', filterDateDebut + 'T00:00:00')
    if (filterDateFin) q = q.lte('created_at', filterDateFin + 'T23:59:59')
    if (filterEmballage !== 'all') q = q.eq('emballage_id', filterEmballage)
    if (filterType !== 'all') q = q.eq('type_mouvement', filterType)
    const { data } = await q
    setMouvements(data || [])
  }, [companyId, filterDateDebut, filterDateFin, filterEmballage, filterType])

  const loadInventaires = useCallback(async () => {
    if (!companyId) return
    const { data } = await supabase
      .from('brasserie_inventaires_emballages')
      .select('*')
      .eq('company_id', companyId)
      .eq('sector_slug', 'brasserie')
      .order('created_at', { ascending: false })
      .limit(20)
    setInventaires(data || [])
  }, [companyId])

  const loadStockFournisseur = useCallback(async () => {
    if (!companyId) return
    try {
      const { data, error } = await supabase
        .from('stock_emballages_fournisseur')
        .select('*')
        .eq('company_id', companyId)
      if (!error && data) {
        setStockFournisseurs(data.map((d: any) => ({
          ...d,
          emballage: emballages.find(e => e.id === d.emballage_id)
        })))
      }
    } catch (_) {}
  }, [companyId, emballages])

  const loadClientsList = useCallback(async () => {
    if (!companyId) return
    try {
      const { data } = await supabase
        .from('clients')
        .select('id, name, phone, code')
        .eq('company_id', companyId)
        .order('name')
      if (data && data.length > 0) {
        setInitialeClientsList(data)
      } else {
        const { data: custData } = await supabaseTenant('customers').select('id, name, phone, code').order('name')
        if (custData) setInitialeClientsList(custData)
      }
    } catch (_) {}
  }, [companyId, supabaseTenant])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([
        loadEmballages(),
        loadConsignations(),
        loadMouvements(),
        loadInventaires(),
        loadStockFournisseur(),
        loadClientsList()
      ])
    } finally {
      setLoading(false)
    }
  }, [loadEmballages, loadConsignations, loadMouvements, loadInventaires, loadStockFournisseur, loadClientsList])

  useEffect(() => {
    if (!initialeClientId) {
      setInitialePrecedents({})
      return
    }
    const prefill = async () => {
      try {
        const { data: initData } = await supabase
          .from('clients_emballages_initiaux')
          .select('emballage_id, precedent_du')
          .eq('company_id', companyId)
          .eq('client_id', initialeClientId)

        const map: Record<string, number> = {}
        if (initData && initData.length > 0) {
          initData.forEach((row: any) => {
            map[row.emballage_id] = Number(row.precedent_du) || 0
          })
        } else {
          const found = clientSoldes.find((c) => c.client_id === initialeClientId)
          if (found) {
            Object.entries(found.soldes).forEach(([embId, s]) => {
              map[embId] = s.solde_du
            })
          }
        }
        setInitialePrecedents(map)
      } catch (_) {}
    }
    prefill()
  }, [initialeClientId, companyId, clientSoldes])

  const handleSaveSituationInitiale = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!initialeClientId) {
      toast.error('Client requis', 'Veuillez sélectionner un client pour enregistrer sa situation initiale.')
      return
    }

    setSavingInitiale(true)
    try {
      let count = 0
      for (const emb of emballages) {
        const prec = Number(initialePrecedents[emb.id]) || 0
        try {
          await supabase.from('clients_emballages_initiaux').upsert({
            company_id: companyId,
            secteur_id: companyId,
            client_id: initialeClientId,
            emballage_id: emb.id,
            precedent_du: prec,
            date_saisie: new Date().toISOString().split('T')[0],
            observation: initialeObservation || 'Situation initiale clients avant utilisation logiciel'
          })
          await supabase.from('clients_emballages_soldes').upsert({
            company_id: companyId,
            secteur_id: companyId,
            client_id: initialeClientId,
            emballage_id: emb.id,
            du_actuel: prec,
            updated_at: new Date().toISOString()
          })
        } catch (_) {}

        // Synchroniser également brasserie_consignations
        const { data: existingCons } = await supabase
          .from('brasserie_consignations')
          .select('id')
          .eq('company_id', companyId)
          .eq('sector_slug', 'brasserie')
          .eq('client_id', initialeClientId)
          .eq('emballage_id', emb.id)
          .maybeSingle()

        if (existingCons) {
          await supabase
            .from('brasserie_consignations')
            .update({
              total_sorti: prec,
              total_retourne: 0,
              solde_du: prec,
              derniere_sortie: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingCons.id)
        } else {
          await supabase
            .from('brasserie_consignations')
            .insert({
              company_id: companyId,
              sector_slug: 'brasserie',
              client_id: initialeClientId,
              emballage_id: emb.id,
              total_sorti: prec,
              total_retourne: 0,
              solde_du: prec,
              derniere_sortie: new Date().toISOString(),
            })
        }
        count++
      }

      toast.success('Situation initiale enregistrée avec succès !', `${count} emballages mis à jour.`)
      await loadConsignations()
      setActiveTab('clients')
    } catch (err: any) {
      toast.error('Erreur', err.message)
    } finally {
      setSavingInitiale(false)
    }
  }

  const handleSaveStockFournisseur = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fFournisseur.emballage_id || !fFournisseur.quantite) {
      toast.error('Champs obligatoires', 'Veuillez choisir un emballage et saisir une quantité.')
      return
    }

    setSavingFournisseur(true)
    try {
      const qte = Number(fFournisseur.quantite) || 0
      await supabase.from('stock_emballages_fournisseur').upsert({
        company_id: companyId,
        secteur_id: companyId,
        emballage_id: fFournisseur.emballage_id,
        fournisseur: fFournisseur.fournisseur,
        type_stock: fFournisseur.type_stock,
        quantite: qte,
        date_initiale: new Date().toISOString().split('T')[0]
      })

      toast.success('Stock fournisseur enregistré avec succès !')
      setFFournisseur(prev => ({ ...prev, quantite: '' }))
      await loadStockFournisseur()
    } catch (err: any) {
      toast.error('Erreur enregistrement stock', err.message)
    } finally {
      setSavingFournisseur(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    if (activeTab === 'historique') loadMouvements()
  }, [activeTab, filterDateDebut, filterDateFin, filterEmballage, filterType])

  // ── Groupement par client ────────────────────────────────────────────────────

  const clientSoldes = useMemo((): ClientSolde[] => {
    const map: Record<string, ClientSolde> = {}
    for (const c of consignations) {
      if (!c.client || !c.emballage) continue
      const cid = c.client_id
      if (!map[cid]) {
        map[cid] = {
          client_id: cid,
          client_name: c.client.name,
          client_phone: c.client.phone,
          client_code: c.client.code,
          soldes: {},
          total_emballages_dus: 0,
        }
      }
      map[cid].soldes[c.emballage_id] = {
        emballage: c.emballage,
        total_sorti: c.total_sorti,
        total_retourne: c.total_retourne,
        solde_du: c.solde_du,
      }
      map[cid].total_emballages_dus += c.solde_du
    }
    return Object.values(map)
      .filter((cs) => cs.total_emballages_dus > 0 || Object.values(cs.soldes).some((s) => s.total_sorti > 0))
      .sort((a, b) => b.total_emballages_dus - a.total_emballages_dus)
  }, [consignations])

  const filteredClientSoldes = useMemo(() => {
    if (!searchClient) return clientSoldes
    const q = searchClient.toLowerCase()
    return clientSoldes.filter(cs =>
      cs.client_name.toLowerCase().includes(q) ||
      (cs.client_phone || '').includes(q) ||
      (cs.client_code || '').toLowerCase().includes(q)
    )
  }, [clientSoldes, searchClient])

  // ── Totaux globaux ────────────────────────────────────────────────────────────

  const totauxGlobaux = useMemo(() => {
    const t: Record<string, { emballage: Emballage; total_sorti: number; total_retourne: number; solde_du: number }> = {}
    for (const c of consignations) {
      if (!c.emballage) continue
      const eid = c.emballage_id
      if (!t[eid]) t[eid] = { emballage: c.emballage, total_sorti: 0, total_retourne: 0, solde_du: 0 }
      t[eid].total_sorti += c.total_sorti
      t[eid].total_retourne += c.total_retourne
      t[eid].solde_du += c.solde_du
    }
    return Object.values(t)
  }, [consignations])

  const totalEmbConsDepose = useMemo(() => emballages.reduce((s, e) => s + (e.stock_depot || 0), 0), [emballages])
  const totalEmbChezClients = useMemo(() => totauxGlobaux.reduce((s, t) => s + t.solde_du, 0), [totauxGlobaux])

  // ── Enregistrer emballage ──────────────────────────────────────────────────

  const handleSaveEmballage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId || !fEmb.code || !fEmb.designation) return
    const payload = {
      company_id: companyId,
      sector_slug: 'brasserie',
      code: fEmb.code.toUpperCase().trim(),
      designation: fEmb.designation.trim(),
      type: fEmb.type,
      unite: fEmb.unite,
      valeur_consignation: Number(fEmb.valeur_consignation) || 0,
      stock_depot: Number(fEmb.stock_depot) || 0,
      notes: fEmb.notes,
      updated_at: new Date().toISOString(),
    }
    if (editingEmballage) {
      const { error } = await supabase.from('brasserie_emballages').update(payload).eq('id', editingEmballage.id)
      if (error) { toast('error', 'Erreur lors de la modification'); return }
      toast('success', 'Emballage modifié')
    } else {
      const { error } = await supabase.from('brasserie_emballages').insert(payload)
      if (error) { toast('error', error.message.includes('unique') ? 'Ce code existe déjà' : 'Erreur création'); return }
      toast('success', 'Emballage créé')
    }
    setModalEmballage(false)
    setEditingEmballage(null)
    setFEmb({ code: '', designation: '', type: 'casier', unite: 'unité', valeur_consignation: '0', stock_depot: '0', notes: '' })
    await loadEmballages()
  }

  // ── Charger situation client pour retour ──────────────────────────────────

  const loadSituationClientPourRetour = useCallback(async (clientId: string) => {
    if (!clientId || !companyId) return
    const { data } = await supabase
      .from('brasserie_consignations')
      .select('*, emballage:brasserie_emballages(*)')
      .eq('company_id', companyId)
      .eq('sector_slug', 'brasserie')
      .eq('client_id', clientId)
      .gt('solde_du', 0)
    setRetourSituationAvant(data || [])
  }, [companyId])

  useEffect(() => {
    if (fRetour.client_id) loadSituationClientPourRetour(fRetour.client_id)
    else setRetourSituationAvant([])
  }, [fRetour.client_id])

  useEffect(() => {
    if (!modalRetour || !companyId) return
    supabase.from('customers')
      .select('id, name, phone')
      .eq('company_id', companyId)
      .eq('sector_slug', 'brasserie')
      .order('name')
      .then(({ data }) => setRetourClients(data || []))
  }, [modalRetour, companyId])

  // ── Valider retour ────────────────────────────────────────────────────────

  const handleValiderRetour = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId || !fRetour.client_id || !fRetour.emballage_id || !fRetour.quantite) return
    const qte = parseInt(fRetour.quantite)
    if (!qte || qte <= 0) { toast('error', 'Quantité invalide'); return }

    const emb = emballages.find(em => em.id === fRetour.emballage_id)
    const situationClient = retourSituationAvant.find(s => s.emballage_id === fRetour.emballage_id)
    const soldeDuAvant = situationClient?.solde_du || 0

    if (qte > soldeDuAvant) {
      toast('error', `Quantité retournée (${qte}) supérieure au solde dû (${soldeDuAvant})`)
      return
    }

    const stockDepotAvant = emb?.stock_depot || 0
    const stockDepotApres = stockDepotAvant + qte
    const soldeDuApres = soldeDuAvant - qte
    const ref = fRetour.reference || `RET-${Date.now().toString(36).toUpperCase()}`

    // 1. Mise à jour consignation client
    if (situationClient) {
      await supabase.from('brasserie_consignations').update({
        total_retourne: (situationClient.total_retourne || 0) + qte,
        solde_du: soldeDuApres,
        dernier_retour: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', situationClient.id)
    } else {
      // Créer une ligne consignation
      await supabase.from('brasserie_consignations').insert({
        company_id: companyId, sector_slug: 'brasserie',
        client_id: fRetour.client_id, emballage_id: fRetour.emballage_id,
        total_sorti: 0, total_retourne: qte, solde_du: 0,
        dernier_retour: new Date().toISOString(),
      })
    }

    // 2. Mise à jour stock dépôt
    if (emb) {
      await supabase.from('brasserie_emballages').update({
        stock_depot: stockDepotApres, updated_at: new Date().toISOString(),
      }).eq('id', emb.id)
    }

    // 3. Mouvement historique
    const mouv: any = {
      company_id: companyId, sector_slug: 'brasserie',
      emballage_id: fRetour.emballage_id,
      client_id: fRetour.client_id,
      type_mouvement: 'RETOUR_CLIENT',
      quantite: qte,
      reference: ref,
      stock_depot_avant: stockDepotAvant,
      stock_depot_apres: stockDepotApres,
      solde_client_avant: soldeDuAvant,
      solde_client_apres: soldeDuApres,
      notes: fRetour.notes,
      created_by_name: user?.full_name || 'Utilisateur',
      created_at: fRetour.date ? fRetour.date + 'T' + new Date().toISOString().slice(11) : new Date().toISOString(),
    }
    const { data: mData } = await supabase.from('brasserie_mouvements_emballages').insert(mouv).select().single()

    toast('success', `Retour enregistré — ${qte} ${emb?.designation || 'emballage(s)'} — Réf: ${ref}`)

    // Impression bon de retour
    if (mData) setPrintingBonRetour({ mouvement: { ...mData, emballage: emb, client: retourClients.find(c => c.id === fRetour.client_id) as any }, avant: soldeDuAvant, apres: soldeDuApres })

    setModalRetour(false)
    setFRetour({ client_id: '', emballage_id: '', quantite: '', date: new Date().toISOString().slice(0, 10), reference: '', notes: '' })
    setRetourSituationAvant([])
    await Promise.all([loadEmballages(), loadConsignations(), loadMouvements()])
  }

  // ── Ajustement ────────────────────────────────────────────────────────────

  const handleAjustement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId || !isAdmin) { toast('error', 'Action réservée aux administrateurs'); return }
    if (!fAjust.emballage_id || !fAjust.quantite || !fAjust.motif) return
    const qte = parseInt(fAjust.quantite)
    if (!qte || qte <= 0) return
    const emb = emballages.find(em => em.id === fAjust.emballage_id)
    const depotAvant = emb?.stock_depot || 0
    const depotApres = fAjust.type === 'AJUSTEMENT_ENTREE' ? depotAvant + qte : Math.max(0, depotAvant - qte)

    await supabase.from('brasserie_emballages').update({ stock_depot: depotApres, updated_at: new Date().toISOString() }).eq('id', fAjust.emballage_id)
    await supabase.from('brasserie_mouvements_emballages').insert({
      company_id: companyId, sector_slug: 'brasserie',
      emballage_id: fAjust.emballage_id,
      type_mouvement: fAjust.type,
      quantite: qte,
      reference: `ADJ-${Date.now().toString(36).toUpperCase()}`,
      ajustement_motif: fAjust.motif,
      stock_depot_avant: depotAvant,
      stock_depot_apres: depotApres,
      created_by_name: user?.full_name || 'Admin',
    })
    toast('success', 'Ajustement enregistré')
    setModalAjustement(false)
    setFAjust({ emballage_id: '', type: 'AJUSTEMENT_ENTREE', quantite: '', motif: '' })
    await Promise.all([loadEmballages(), loadMouvements()])
  }

  // ── Inventaire ────────────────────────────────────────────────────────────

  const openInventaire = () => {
    setInvLignes(emballages.map(e => ({ emballage_id: e.id, stock_theorique: e.stock_depot, stock_physique: String(e.stock_depot), observation: '' })))
    setModalInventaire(true)
  }

  const handleValiderInventaire = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId || !isAdmin) { toast('error', 'Réservé aux administrateurs'); return }
    const ref = `INV-EMB-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
    const { data: inv } = await supabase.from('brasserie_inventaires_emballages').insert({
      company_id: companyId, sector_slug: 'brasserie',
      reference: ref,
      date_inventaire: new Date().toISOString().slice(0, 10),
      statut: 'valide',
      valide_par_name: user?.full_name || 'Admin',
      valide_at: new Date().toISOString(),
      created_by_name: user?.full_name || 'Admin',
    }).select().single()

    if (inv) {
      for (const ligne of invLignes) {
        const physique = parseInt(ligne.stock_physique) || 0
        await supabase.from('brasserie_inventaire_lignes').insert({
          inventaire_id: inv.id, emballage_id: ligne.emballage_id,
          stock_theorique: ligne.stock_theorique, stock_physique: physique, observation: ligne.observation,
        })
        if (physique !== ligne.stock_theorique) {
          const emb = emballages.find(em => em.id === ligne.emballage_id)
          await supabase.from('brasserie_emballages').update({ stock_depot: physique, updated_at: new Date().toISOString() }).eq('id', ligne.emballage_id)
          await supabase.from('brasserie_mouvements_emballages').insert({
            company_id: companyId, sector_slug: 'brasserie',
            emballage_id: ligne.emballage_id,
            type_mouvement: 'INVENTAIRE',
            quantite: Math.abs(physique - ligne.stock_theorique),
            reference: ref, inventaire_id: inv.id,
            ajustement_motif: `Inventaire physique — écart: ${physique - ligne.stock_theorique > 0 ? '+' : ''}${physique - ligne.stock_theorique}`,
            stock_depot_avant: ligne.stock_theorique,
            stock_depot_apres: physique,
            notes: ligne.observation,
            created_by_name: user?.full_name || 'Admin',
          })
        }
      }
    }
    toast('success', `Inventaire ${ref} validé`)
    setModalInventaire(false)
    await Promise.all([loadEmballages(), loadMouvements(), loadInventaires()])
  }

  // ── Impression bon de retour ─────────────────────────────────────────────

  const handlePrintBonRetour = () => {
    if (!printingBonRetour) return
    window.print()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-slate-500 text-sm">Chargement des consignations...</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* ── En-tête ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <span className="text-3xl">📦</span>
            Gestion des Consignations
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Brasserie & Dépôt de Boissons — Emballages casiers</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setModalRetour(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition shadow-sm">
            <ArrowDownLeft className="w-4 h-4" /> Enregistrer un retour
          </button>
          <button onClick={() => loadAll()} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 overflow-x-auto pb-1 border-b border-slate-200">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs sm:text-sm font-medium transition whitespace-nowrap',
                activeTab === tab.id
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'text-slate-500 hover:text-amber-700 hover:bg-amber-50'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
            </button>
          )
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: SITUATION INITIALE (RUBRIQUE DEMANDÉE)                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'initiale' && (
        <div className="space-y-5">
          <div className="bg-white rounded-3xl border border-amber-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="p-2 rounded-2xl bg-amber-100 text-amber-800">
                <Layers className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-lg font-black text-slate-800">Situation Initiale des Emballages par Client</h3>
                <p className="text-xs text-slate-500">
                  Saisissez les soldes d'emballages dus par les clients avant le démarrage du logiciel (historique papier).
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveSituationInitiale} className="space-y-6 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Sélectionner le Client <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={initialeClientId}
                    onChange={(e) => setInitialeClientId(e.target.value)}
                    required
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">-- Choisir un client --</option>
                    {initialeClientsList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ''} {c.code ? `[${c.code}]` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Observation / Note de départ
                  </label>
                  <input
                    type="text"
                    value={initialeObservation}
                    onChange={(e) => setInitialeObservation(e.target.value)}
                    placeholder="Ex : Report inventaire initial au 01/01/2026"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Tableau des emballages types */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Emballages & Casiers — Soldes Dûs
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    {emballages.length} types d'emballages configurés
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-100/50 text-slate-600 font-bold">
                        <th className="p-3 text-left">Code</th>
                        <th className="p-3 text-left">Désignation de l'emballage</th>
                        <th className="p-3 text-center">Unité</th>
                        <th className="p-3 text-right w-44">Précédent Dû (Avant Logiciel)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {emballages.map((emb) => (
                        <tr key={emb.id} className="hover:bg-slate-50/80 transition">
                          <td className="p-3 font-mono font-bold text-amber-800">
                            <span className="px-2 py-0.5 rounded-lg bg-amber-100 border border-amber-200">
                              {emb.code}
                            </span>
                          </td>
                          <td className="p-3 font-semibold text-slate-800">
                            {emb.designation}
                          </td>
                          <td className="p-3 text-center text-slate-500">
                            {emb.unite || 'Unité'}
                          </td>
                          <td className="p-3 text-right">
                            <input
                              type="number"
                              min="0"
                              value={initialePrecedents[emb.id] ?? ''}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value) || 0)
                                setInitialePrecedents((prev) => ({ ...prev, [emb.id]: val }))
                              }}
                              placeholder="0"
                              className="w-32 p-1.5 text-right font-mono font-bold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-amber-500"
                            />
                          </td>
                        </tr>
                      ))}
                      {emballages.length === 0 && (
                        <tr>
                          <td colSpan={4} className="p-6 text-center text-slate-400 italic">
                            Aucun type d'emballage configuré. Ajoutez vos types d'emballages dans l'onglet "Emballages Types".
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="submit"
                  disabled={savingInitiale || !initialeClientId}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  {savingInitiale ? 'Enregistrement en cours...' : 'Enregistrer la Situation Initiale'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: STOCK FOURNISSEUR (GESTION EMBALLAGES PLEIN / VIDE)            */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'fournisseur' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Formulaire ajout / mise à jour stock fournisseur */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Box className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-slate-800 text-sm">Ajouter Stock Fournisseur</h3>
              </div>

              <form onSubmit={handleSaveStockFournisseur} className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Fournisseur</label>
                  <input
                    type="text"
                    value={fFournisseur.fournisseur}
                    onChange={(e) => setFFournisseur({ ...fFournisseur, fournisseur: e.target.value })}
                    placeholder="SOBEBRA, BB, etc."
                    required
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Emballage</label>
                  <select
                    value={fFournisseur.emballage_id}
                    onChange={(e) => setFFournisseur({ ...fFournisseur, emballage_id: e.target.value })}
                    required
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
                  >
                    <option value="">-- Choisir un emballage --</option>
                    {emballages.map((emb) => (
                      <option key={emb.id} value={emb.id}>
                        [{emb.code}] {emb.designation}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Type de Stock</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFFournisseur({ ...fFournisseur, type_stock: 'plein' })}
                      className={clsx(
                        'py-2 px-3 rounded-xl font-bold transition text-center',
                        fFournisseur.type_stock === 'plein'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      )}
                    >
                      Plein
                    </button>
                    <button
                      type="button"
                      onClick={() => setFFournisseur({ ...fFournisseur, type_stock: 'vide' })}
                      className={clsx(
                        'py-2 px-3 rounded-xl font-bold transition text-center',
                        fFournisseur.type_stock === 'vide'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      )}
                    >
                      Vide
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Quantité</label>
                  <input
                    type="number"
                    min="0"
                    value={fFournisseur.quantite}
                    onChange={(e) => setFFournisseur({ ...fFournisseur, quantite: e.target.value })}
                    placeholder="0"
                    required
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingFournisseur}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition shadow-sm"
                >
                  {savingFournisseur ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </form>
            </div>

            {/* Tableau récapitulatif stock fournisseur */}
            <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-3">
              <h3 className="font-bold text-slate-800 text-sm">Stocks Fournisseurs Enregistrés</h3>
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                      <th className="p-3 text-left">Fournisseur</th>
                      <th className="p-3 text-left">Emballage</th>
                      <th className="p-3 text-center">Type</th>
                      <th className="p-3 text-right">Quantité</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stockFournisseurs.map((sf, idx) => (
                      <tr key={sf.id || idx} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-800">{sf.fournisseur}</td>
                        <td className="p-3 font-medium text-slate-700">{sf.emballage?.designation || sf.emballage_id}</td>
                        <td className="p-3 text-center">
                          <span className={clsx(
                            'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                            sf.type_stock === 'plein' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          )}>
                            {sf.type_stock}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold">{sf.quantite}</td>
                      </tr>
                    ))}
                    {stockFournisseurs.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-slate-400 italic">
                          Aucun stock fournisseur saisi pour l'instant.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: DASHBOARD */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'dashboard' && (
        <div className="space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Emballages au Dépôt</p>
              <p className="text-2xl font-black text-slate-800">{totalEmbConsDepose.toLocaleString('fr-FR')}</p>
              <p className="text-xs text-slate-400 mt-1">Stock disponible</p>
            </div>
            <div className="bg-white rounded-2xl border border-amber-200 p-4 shadow-sm">
              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Chez les Clients</p>
              <p className="text-2xl font-black text-amber-700">{totalEmbChezClients.toLocaleString('fr-FR')}</p>
              <p className="text-xs text-amber-400 mt-1">Solde dû total</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Clients avec dettes</p>
              <p className="text-2xl font-black text-slate-800">{clientSoldes.filter(cs => cs.total_emballages_dus > 0).length}</p>
              <p className="text-xs text-slate-400 mt-1">clients actifs</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Types Emballages</p>
              <p className="text-2xl font-black text-slate-800">{emballages.length}</p>
              <p className="text-xs text-slate-400 mt-1">types actifs</p>
            </div>
          </div>

          {/* Récap par emballage */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center gap-2">
              <Box className="w-4 h-4 text-amber-500" />
              <h3 className="font-bold text-slate-700">Situation par type d'emballage</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Emballage</th>
                    <th className="px-4 py-3 text-right">Stock Dépôt</th>
                    <th className="px-4 py-3 text-right">Total Sorti</th>
                    <th className="px-4 py-3 text-right">Total Retourné</th>
                    <th className="px-4 py-3 text-right">Chez Clients</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {emballages.map(emb => {
                    const t = totauxGlobaux.find(tg => tg.emballage.id === emb.id)
                    return (
                      <tr key={emb.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 text-xs font-bold">{emb.code}</span>
                            <span className="font-medium text-slate-700">{emb.designation}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800">{emb.stock_depot.toLocaleString('fr-FR')}</td>
                        <td className="px-4 py-3 text-right text-red-600 font-semibold">{(t?.total_sorti || 0).toLocaleString('fr-FR')}</td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-semibold">{(t?.total_retourne || 0).toLocaleString('fr-FR')}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={clsx('font-black', (t?.solde_du || 0) > 0 ? 'text-amber-700' : 'text-slate-400')}>
                            {(t?.solde_du || 0).toLocaleString('fr-FR')}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                  {emballages.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">Aucun emballage configuré</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top clients */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-500" />
                <h3 className="font-bold text-slate-700">Top clients — emballages dus</h3>
              </div>
              <button onClick={() => setActiveTab('clients')} className="text-xs text-amber-600 hover:underline flex items-center gap-1">
                Voir tous <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="divide-y divide-slate-50">
              {clientSoldes.slice(0, 8).map(cs => (
                <div key={cs.client_id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition cursor-pointer" onClick={() => { setDetailClient(cs); setActiveTab('clients') }}>
                  <div>
                    <p className="font-semibold text-slate-700 text-sm">{cs.client_name}</p>
                    <p className="text-xs text-slate-400">{cs.client_phone}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {Object.values(cs.soldes).filter(s => s.solde_du > 0).map(s => (
                      <span key={s.emballage.id} className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold">
                        {s.solde_du} {s.emballage.code}
                      </span>
                    ))}
                    <span className="text-slate-400 text-xs">→</span>
                  </div>
                </div>
              ))}
              {clientSoldes.length === 0 && (
                <div className="px-4 py-8 text-center text-slate-400 text-sm">Aucun emballage en circulation</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: EMBALLAGES */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'emballages' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-700">Types d'emballages configurés</h3>
            <div className="flex gap-2">
              <button onClick={() => setModalAjustement(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition">
                <Settings className="w-4 h-4" /> Ajustement stock
              </button>
              <button onClick={() => { setEditingEmballage(null); setFEmb({ code: '', designation: '', type: 'casier', unite: 'unité', valeur_consignation: '0', stock_depot: '0', notes: '' }); setModalEmballage(true) }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition">
                <Plus className="w-4 h-4" /> Nouvel emballage
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {emballages.map(emb => {
              const chezClients = totauxGlobaux.find(t => t.emballage.id === emb.id)?.solde_du || 0
              return (
                <div key={emb.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 rounded-xl bg-amber-100 text-amber-800 text-sm font-black">{emb.code}</span>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditingEmballage(emb); setFEmb({ code: emb.code, designation: emb.designation, type: emb.type, unite: emb.unite, valeur_consignation: String(emb.valeur_consignation), stock_depot: String(emb.stock_depot), notes: emb.notes || '' }); setModalEmballage(true) }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="font-bold text-slate-800">{emb.designation}</p>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="bg-slate-50 rounded-xl p-2">
                      <p className="text-xs text-slate-400">Stock Dépôt</p>
                      <p className="text-xl font-black text-slate-800">{emb.stock_depot.toLocaleString('fr-FR')}</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-2">
                      <p className="text-xs text-amber-500">Chez Clients</p>
                      <p className="text-xl font-black text-amber-700">{chezClients.toLocaleString('fr-FR')}</p>
                    </div>
                  </div>
                  {emb.valeur_consignation > 0 && (
                    <p className="text-xs text-slate-400">Valeur consignation : {fmt(emb.valeur_consignation)}</p>
                  )}
                </div>
              )
            })}
            {emballages.length === 0 && (
              <div className="col-span-3 text-center py-12 text-slate-400">Aucun emballage — Cliquez sur "Nouvel emballage"</div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: SITUATION CLIENTS */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'clients' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
            <h3 className="font-bold text-slate-700">Récapitulatif tous les clients</h3>
            <div className="flex gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={searchClient} onChange={e => setSearchClient(e.target.value)} placeholder="Rechercher un client..." className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm w-full focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none" />
              </div>
              <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition">
                <Printer className="w-4 h-4" /> Imprimer
              </button>
            </div>
          </div>

          {/* Vue détail client si sélectionné */}
          {detailClient && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-amber-800 flex items-center gap-2">
                  <Users className="w-4 h-4" /> {detailClient.client_name}
                </h4>
                <button onClick={() => setDetailClient(null)} className="p-1 rounded-lg text-amber-400 hover:text-amber-700 hover:bg-amber-100">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {detailClient.client_phone && <p className="text-sm text-amber-600">📞 {detailClient.client_phone}</p>}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-bold text-amber-700 uppercase">
                      <th className="text-left pb-2">Emballage</th>
                      <th className="text-right pb-2">Total Sorti</th>
                      <th className="text-right pb-2">Total Retourné</th>
                      <th className="text-right pb-2">Solde Dû</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(detailClient.soldes).map(s => (
                      <tr key={s.emballage.id} className="border-t border-amber-200">
                        <td className="py-2 font-semibold text-amber-900">{s.emballage.designation}</td>
                        <td className="py-2 text-right text-red-600 font-semibold">{s.total_sorti.toLocaleString('fr-FR')}</td>
                        <td className="py-2 text-right text-emerald-600 font-semibold">{s.total_retourne.toLocaleString('fr-FR')}</td>
                        <td className="py-2 text-right font-black text-amber-800">{s.solde_du.toLocaleString('fr-FR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-right text-sm font-black text-amber-900">Total dû : {detailClient.total_emballages_dus.toLocaleString('fr-FR')} emballages</p>
            </div>
          )}

          {/* Tableau récapitulatif */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" id="printable-area">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Client</th>
                    {emballages.map(emb => (
                      <th key={emb.id} className="px-4 py-3 text-center">{emb.code}</th>
                    ))}
                    <th className="px-4 py-3 text-right">Total Dû</th>
                    <th className="px-4 py-3 no-print"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredClientSoldes.map(cs => (
                    <tr key={cs.client_id} className="hover:bg-slate-50 transition cursor-pointer" onClick={() => setDetailClient(cs)}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-700">{cs.client_name}</p>
                        {cs.client_phone && <p className="text-xs text-slate-400">{cs.client_phone}</p>}
                      </td>
                      {emballages.map(emb => {
                        const s = cs.soldes[emb.id]
                        return (
                          <td key={emb.id} className="px-4 py-3 text-center">
                            <span className={clsx('font-bold', (s?.solde_du || 0) > 0 ? 'text-amber-700' : 'text-slate-300')}>
                              {(s?.solde_du || 0).toLocaleString('fr-FR')}
                            </span>
                          </td>
                        )
                      })}
                      <td className="px-4 py-3 text-right font-black text-amber-800">{cs.total_emballages_dus.toLocaleString('fr-FR')}</td>
                      <td className="px-4 py-3 no-print">
                        <button onClick={e => { e.stopPropagation(); setDetailClient(cs) }} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {/* Totaux */}
                  {filteredClientSoldes.length > 0 && (
                    <tr className="bg-amber-50 font-black text-amber-900 border-t-2 border-amber-200">
                      <td className="px-4 py-3">TOTAL GÉNÉRAL</td>
                      {emballages.map(emb => {
                        const total = filteredClientSoldes.reduce((s, cs) => s + (cs.soldes[emb.id]?.solde_du || 0), 0)
                        return <td key={emb.id} className="px-4 py-3 text-center">{total.toLocaleString('fr-FR')}</td>
                      })}
                      <td className="px-4 py-3 text-right">{filteredClientSoldes.reduce((s, cs) => s + cs.total_emballages_dus, 0).toLocaleString('fr-FR')}</td>
                      <td className="no-print"></td>
                    </tr>
                  )}
                  {filteredClientSoldes.length === 0 && (
                    <tr><td colSpan={emballages.length + 3} className="px-4 py-10 text-center text-slate-400">Aucun client avec des emballages en circulation</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: RETOURS */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'retours' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-700">Retours d'emballages enregistrés</h3>
            <button onClick={() => setModalRetour(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition">
              <Plus className="w-4 h-4" /> Nouveau retour
            </button>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase">
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Client</th>
                    <th className="px-4 py-3 text-left">Emballage</th>
                    <th className="px-4 py-3 text-right">Qté</th>
                    <th className="px-4 py-3 text-left">Référence</th>
                    <th className="px-4 py-3 text-left">Avant</th>
                    <th className="px-4 py-3 text-left">Après</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {mouvements.filter(m => m.type_mouvement === 'RETOUR_CLIENT' || m.type_mouvement === 'RETOUR_IMMEDIAT').map(m => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-500 text-xs">{fmtDateTime(m.created_at)}</td>
                      <td className="px-4 py-3 font-medium text-slate-700">{m.client?.name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 text-xs font-bold">{m.emballage?.code}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">+{m.quantite}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{m.reference}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{m.solde_client_avant ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-emerald-600 font-semibold">{m.solde_client_apres ?? '—'}</td>
                    </tr>
                  ))}
                  {mouvements.filter(m => m.type_mouvement === 'RETOUR_CLIENT' || m.type_mouvement === 'RETOUR_IMMEDIAT').length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Aucun retour enregistré</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: HISTORIQUE */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'historique' && (
        <div className="space-y-4">
          {/* Filtres */}
          <div className="flex flex-wrap gap-2 bg-white rounded-2xl border border-slate-200 p-3">
            <input type="date" value={filterDateDebut} onChange={e => setFilterDateDebut(e.target.value)} className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-amber-200 outline-none" placeholder="Du" />
            <input type="date" value={filterDateFin} onChange={e => setFilterDateFin(e.target.value)} className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-amber-200 outline-none" placeholder="Au" />
            <select value={filterEmballage} onChange={e => setFilterEmballage(e.target.value)} className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-amber-200 outline-none">
              <option value="all">Tous emballages</option>
              {emballages.map(e => <option key={e.id} value={e.id}>{e.designation}</option>)}
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-amber-200 outline-none">
              <option value="all">Tous types</option>
              {Object.entries(MOUVEMENT_LABELS || {}).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button onClick={loadMouvements} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600">
              <Search className="w-3.5 h-3.5" /> Filtrer
            </button>
            <button onClick={() => { setFilterDateDebut(''); setFilterDateFin(''); setFilterEmballage('all'); setFilterType('all') }} className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm text-slate-500 hover:bg-slate-50">
              Réinitialiser
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase">
                    <th className="px-4 py-3 text-left">Date / Heure</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Emballage</th>
                    <th className="px-4 py-3 text-left">Client</th>
                    <th className="px-4 py-3 text-right">Qté</th>
                    <th className="px-4 py-3 text-left">Référence</th>
                    <th className="px-4 py-3 text-left">Par</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {mouvements.map(m => {
                    const mt = MOUVEMENT_LABELS[m.type_mouvement] || { label: m.type_mouvement, color: 'text-slate-600', bg: 'bg-slate-50', icon: FileText }
                    const Icon = mt.icon
                    const isEntree = ['RETOUR_CLIENT', 'RETOUR_IMMEDIAT', 'AJUSTEMENT_ENTREE', 'AVOIR_RETOUR'].includes(m.type_mouvement)
                    return (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-xs text-slate-400">{fmtDateTime(m.created_at)}</td>
                        <td className="px-4 py-3">
                          <span className={clsx('flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold w-fit', mt.color, mt.bg)}>
                            <Icon className="w-3 h-3" /> {mt.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold">{m.emballage?.code}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{m.client?.name || m.ajustement_motif || '—'}</td>
                        <td className="px-4 py-3 text-right font-black">
                          <span className={isEntree ? 'text-emerald-600' : 'text-red-600'}>
                            {isEntree ? '+' : '-'}{m.quantite}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">{m.reference}</td>
                        <td className="px-4 py-3 text-xs text-slate-400">{m.created_by_name}</td>
                      </tr>
                    )
                  })}
                  {mouvements.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Aucun mouvement trouvé</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: INVENTAIRE */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'inventaire' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-700">Inventaires d'emballages</h3>
            {isAdmin && (
              <button onClick={openInventaire} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition">
                <ClipboardCheck className="w-4 h-4" /> Nouvel inventaire
              </button>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase">
                  <th className="px-4 py-3 text-left">Référence</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Statut</th>
                  <th className="px-4 py-3 text-left">Validé par</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {inventaires.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-700 text-xs">{inv.reference}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{fmtDate(inv.date_inventaire)}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('px-2 py-0.5 rounded-lg text-xs font-bold',
                        inv.statut === 'valide' ? 'bg-emerald-100 text-emerald-700' :
                        inv.statut === 'en_cours' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                      )}>{inv.statut}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{inv.valide_par_name || '—'}</td>
                  </tr>
                ))}
                {inventaires.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Aucun inventaire effectué</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: AJUSTEMENTS */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'ajustements' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-slate-700">Ajustements de stock</h3>
              <p className="text-xs text-slate-400 mt-0.5">Réservé aux administrateurs et gestionnaires</p>
            </div>
            {isAdmin && (
              <button onClick={() => setModalAjustement(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition">
                <Settings className="w-4 h-4" /> Nouvel ajustement
              </button>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase">
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Emballage</th>
                    <th className="px-4 py-3 text-right">Qté</th>
                    <th className="px-4 py-3 text-left">Motif</th>
                    <th className="px-4 py-3 text-left">Par</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {mouvements.filter(m => m.type_mouvement.startsWith('AJUSTEMENT') || m.type_mouvement === 'INVENTAIRE').map(m => {
                    const mt = MOUVEMENT_LABELS[m.type_mouvement]
                    const isEntree = m.type_mouvement === 'AJUSTEMENT_ENTREE'
                    return (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-xs text-slate-400">{fmtDateTime(m.created_at)}</td>
                        <td className="px-4 py-3">
                          <span className={clsx('px-2 py-0.5 rounded-lg text-xs font-bold', mt?.color, mt?.bg)}>{mt?.label}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold">{m.emballage?.code}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-black">
                          <span className={isEntree ? 'text-emerald-600' : 'text-red-600'}>
                            {isEntree ? '+' : '-'}{m.quantite}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{m.ajustement_motif || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-400">{m.created_by_name}</td>
                      </tr>
                    )
                  })}
                  {mouvements.filter(m => m.type_mouvement.startsWith('AJUSTEMENT') || m.type_mouvement === 'INVENTAIRE').length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Aucun ajustement effectué</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODALS */}
      {/* ══════════════════════════════════════════════════════════════════════ */}

      {/* Modal: Créer/Modifier emballage */}
      {modalEmballage && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-bold text-slate-800">{editingEmballage ? 'Modifier' : 'Nouvel'} emballage</h3>
              <button onClick={() => { setModalEmballage(false); setEditingEmballage(null) }} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSaveEmballage} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Code *</label>
                  <input value={fEmb.code} onChange={e => setFEmb(p => ({ ...p, code: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-amber-300 outline-none" placeholder="C12T" required disabled={!!editingEmballage} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Type</label>
                  <select value={fEmb.type} onChange={e => setFEmb(p => ({ ...p, type: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-amber-300 outline-none">
                    <option value="casier">Casier</option>
                    <option value="bouteille">Bouteille</option>
                    <option value="fut">Fût</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Désignation *</label>
                <input value={fEmb.designation} onChange={e => setFEmb(p => ({ ...p, designation: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-amber-300 outline-none" placeholder="Casier 12 Bouteilles" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Unité</label>
                  <input value={fEmb.unite} onChange={e => setFEmb(p => ({ ...p, unite: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-amber-300 outline-none" placeholder="casier" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Stock Dépôt</label>
                  <input type="number" min="0" value={fEmb.stock_depot} onChange={e => setFEmb(p => ({ ...p, stock_depot: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-amber-300 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Valeur consignation (FCFA)</label>
                <input type="number" min="0" value={fEmb.valeur_consignation} onChange={e => setFEmb(p => ({ ...p, valeur_consignation: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-amber-300 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
                <textarea value={fEmb.notes} onChange={e => setFEmb(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-amber-300 outline-none resize-none" rows={2} />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setModalEmballage(false); setEditingEmballage(null) }} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Annuler</button>
                <button type="submit" className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Retour d'emballages */}
      {modalRetour && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-4">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><ArrowDownLeft className="w-5 h-5 text-emerald-600" /> Retour d'emballages</h3>
              <button onClick={() => setModalRetour(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleValiderRetour} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Client *</label>
                <select value={fRetour.client_id} onChange={e => setFRetour(p => ({ ...p, client_id: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" required>
                  <option value="">— Sélectionner un client —</option>
                  {retourClients.map(c => <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>)}
                </select>
              </div>

              {/* Situation du client */}
              {retourSituationAvant.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs font-bold text-amber-700 mb-2">📊 Situation actuelle du client</p>
                  <div className="space-y-1">
                    {retourSituationAvant.map(s => (
                      <div key={s.id} className="flex justify-between text-xs text-amber-800">
                        <span>{s.emballage?.designation}</span>
                        <span className="font-bold">{s.solde_du} dû</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Emballage *</label>
                  <select value={fRetour.emballage_id} onChange={e => setFRetour(p => ({ ...p, emballage_id: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" required>
                    <option value="">— Type —</option>
                    {emballages.map(e => <option key={e.id} value={e.id}>{e.designation}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Quantité retournée *</label>
                  <input type="number" min="1" value={fRetour.quantite} onChange={e => setFRetour(p => ({ ...p, quantite: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" required placeholder="0" />
                </div>
              </div>

              {/* Aperçu du nouveau solde */}
              {fRetour.emballage_id && fRetour.quantite && fRetour.client_id && (() => {
                const sit = retourSituationAvant.find(s => s.emballage_id === fRetour.emballage_id)
                const soldeDuAvant = sit?.solde_du || 0
                const qte = parseInt(fRetour.quantite) || 0
                const nouveauSolde = soldeDuAvant - qte
                return (
                  <div className={clsx('rounded-xl p-3 text-sm border', nouveauSolde < 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200')}>
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="text-slate-600">Solde avant retour</span>
                      <span className="font-bold text-slate-700">{soldeDuAvant}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="text-slate-600">Retour</span>
                      <span className="font-bold text-emerald-600">- {qte}</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-slate-200 pt-1 mt-1">
                      <span className="font-bold text-slate-700">Nouveau solde</span>
                      <span className={clsx('font-black text-base', nouveauSolde < 0 ? 'text-red-600' : 'text-emerald-700')}>{nouveauSolde}</span>
                    </div>
                    {nouveauSolde < 0 && <p className="text-red-600 text-xs mt-1">⚠️ Quantité supérieure au solde dû</p>}
                  </div>
                )
              })()}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
                  <input type="date" value={fRetour.date} onChange={e => setFRetour(p => ({ ...p, date: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Référence</label>
                  <input value={fRetour.reference} onChange={e => setFRetour(p => ({ ...p, reference: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-300 outline-none" placeholder="Auto si vide" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Observation</label>
                <textarea value={fRetour.notes} onChange={e => setFRetour(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-300 outline-none resize-none" rows={2} />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setModalRetour(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Annuler</button>
                <button type="submit" className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700">
                  <Check className="w-4 h-4 inline mr-1" /> Valider le retour
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Ajustement */}
      {modalAjustement && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Settings className="w-5 h-5 text-violet-600" /> Ajustement de stock</h3>
              <button onClick={() => setModalAjustement(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAjustement} className="p-5 space-y-4">
              {!isAdmin && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                  ⚠️ Action réservée aux administrateurs
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Emballage *</label>
                <select value={fAjust.emballage_id} onChange={e => setFAjust(p => ({ ...p, emballage_id: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-violet-300 outline-none" required>
                  <option value="">— Sélectionner —</option>
                  {emballages.map(e => <option key={e.id} value={e.id}>{e.designation} (stock: {e.stock_depot})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Type *</label>
                  <select value={fAjust.type} onChange={e => setFAjust(p => ({ ...p, type: e.target.value as any }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-violet-300 outline-none">
                    <option value="AJUSTEMENT_ENTREE">Entrée (+)</option>
                    <option value="AJUSTEMENT_SORTIE">Sortie (-)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Quantité *</label>
                  <input type="number" min="1" value={fAjust.quantite} onChange={e => setFAjust(p => ({ ...p, quantite: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-violet-300 outline-none" required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Motif obligatoire *</label>
                <textarea value={fAjust.motif} onChange={e => setFAjust(p => ({ ...p, motif: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-violet-300 outline-none resize-none" rows={2} required placeholder="Expliquer la raison de cet ajustement..." />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setModalAjustement(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Annuler</button>
                <button type="submit" disabled={!isAdmin} className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  Valider l'ajustement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Inventaire */}
      {modalInventaire && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-4">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-amber-500" /> Inventaire physique</h3>
              <button onClick={() => setModalInventaire(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleValiderInventaire} className="p-5 space-y-4">
              <p className="text-sm text-slate-500">Saisissez les quantités physiques constatées. Les écarts seront automatiquement enregistrés.</p>
              <div className="space-y-3">
                {invLignes.map((ligne, idx) => {
                  const emb = emballages.find(e => e.id === ligne.emballage_id)
                  const physique = parseInt(ligne.stock_physique) || 0
                  const ecart = physique - ligne.stock_theorique
                  return (
                    <div key={ligne.emballage_id} className="bg-slate-50 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-700 text-sm">{emb?.designation}</span>
                        <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 text-xs font-bold">{emb?.code}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-center">
                        <div><p className="text-slate-400">Théorique</p><p className="font-bold text-slate-700">{ligne.stock_theorique}</p></div>
                        <div>
                          <p className="text-slate-400">Physique</p>
                          <input type="number" min="0" value={ligne.stock_physique}
                            onChange={e => setInvLignes(prev => prev.map((l, i) => i === idx ? { ...l, stock_physique: e.target.value } : l))}
                            className="w-full text-center px-2 py-1 rounded-lg border border-slate-200 text-sm font-bold focus:ring-2 focus:ring-amber-300 outline-none" />
                        </div>
                        <div>
                          <p className="text-slate-400">Écart</p>
                          <p className={clsx('font-black', ecart > 0 ? 'text-emerald-600' : ecart < 0 ? 'text-red-600' : 'text-slate-400')}>
                            {ecart > 0 ? '+' : ''}{ecart}
                          </p>
                        </div>
                      </div>
                      <input placeholder="Observation (optionnel)" value={ligne.observation}
                        onChange={e => setInvLignes(prev => prev.map((l, i) => i === idx ? { ...l, observation: e.target.value } : l))}
                        className="w-full px-2 py-1 rounded-lg border border-slate-100 text-xs focus:ring-1 focus:ring-amber-200 outline-none" />
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setModalInventaire(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Annuler</button>
                <button type="submit" className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600">
                  <Check className="w-4 h-4 inline mr-1" /> Valider l'inventaire
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* BON DE RETOUR IMPRIMABLE */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {printingBonRetour && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md space-y-0">
            <div className="flex items-center justify-between p-4 border-b no-print">
              <h3 className="font-bold text-slate-800">Bon de retour — Prêt à imprimer</h3>
              <button onClick={() => setPrintingBonRetour(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div id="printable-area" className="p-6">
              <div className="text-center border-b border-slate-200 pb-4 mb-4">
                <h2 className="text-lg font-black text-slate-800">BON DE RETOUR D'EMBALLAGES</h2>
                <p className="text-xs text-slate-400 mt-1">Brasserie & Dépôt de Boissons</p>
              </div>
              <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between"><span className="text-slate-500">Réf. :</span><span className="font-bold">{printingBonRetour.mouvement.reference}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Date :</span><span>{fmtDate(printingBonRetour.mouvement.created_at)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Client :</span><span className="font-bold">{printingBonRetour.mouvement.client?.name}</span></div>
              </div>
              <table className="w-full text-sm mb-4 border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="text-left p-2 text-xs font-bold">Emballage</th>
                    <th className="text-center p-2 text-xs font-bold">Avant</th>
                    <th className="text-center p-2 text-xs font-bold">Retour</th>
                    <th className="text-center p-2 text-xs font-bold">Après</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-slate-200">
                    <td className="p-2 font-semibold">{printingBonRetour.mouvement.emballage?.designation}</td>
                    <td className="p-2 text-center">{printingBonRetour.avant}</td>
                    <td className="p-2 text-center font-bold text-emerald-600">-{printingBonRetour.mouvement.quantite}</td>
                    <td className="p-2 text-center font-bold">{printingBonRetour.apres}</td>
                  </tr>
                </tbody>
              </table>
              <div className="grid grid-cols-2 gap-8 mt-6 text-xs text-center text-slate-500">
                <div className="border-t border-slate-300 pt-2">Signature Client</div>
                <div className="border-t border-slate-300 pt-2">Signature Magasinier</div>
              </div>
            </div>
            <div className="p-4 border-t flex gap-2 no-print">
              <button onClick={() => setPrintingBonRetour(null)} className="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Fermer</button>
              <button onClick={handlePrintBonRetour} className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 flex items-center justify-center gap-2">
                <Printer className="w-4 h-4" /> Imprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BrasserieConsignationPage
