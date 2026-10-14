// =============================================================================
// GESTIO 229 SaaS — Supervision Logistique & Disponibilité Flotte BTP
// Conforme Spécification Section Module 2
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Layers, Search, MapPin, Truck, AlertTriangle, ShieldCheck,
  CheckCircle2, Clock, DollarSign, Fuel, Wrench, HardHat,
  ArrowRight, Repeat, Calendar, ShieldAlert, FileText, ChevronRight
} from 'lucide-react'
import { useTenant } from '../../../../hooks/useTenant'
import { useUIStore } from '../../../../store/uiStore'
import { formatFCFA } from '../../../../utils/tax'
import { Link } from 'react-router-dom'
import {
  BtpMateriel,
  BtpSite,
  BtpChantier,
  BtpTransfertIntersite
} from '../../../../services/garageService'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

export const BtpLogistiquePage: React.FC = () => {
  const { companyId, supabaseTenant, sectorSlug } = useTenant()
  const { toast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [materiels, setMateriels] = useState<BtpMateriel[]>([])
  const [sites, setSites] = useState<BtpSite[]>([])
  const [chantiers, setChantiers] = useState<BtpChantier[]>([])
  const [transfertsEnTransit, setTransfertsEnTransit] = useState<BtpTransfertIntersite[]>([])

  const [search, setSearch] = useState('')
  const [selectedCategorie, setSelectedCategorie] = useState('ALL')
  const [selectedStatut, setSelectedStatut] = useState('ALL')

  const prefix = `/app/${sectorSlug || 'garage'}`

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [matRes, siteRes, chtRes, trRes] = await Promise.all([
        supabaseTenant('btp_materiels').select('*').order('code_materiel'),
        supabaseTenant('btp_sites').select('*').order('nom_site'),
        supabaseTenant('btp_chantiers').select('*').order('nom_chantier'),
        supabaseTenant('btp_transferts_intersites').select('*').eq('statut', 'EN_TRANSIT')
      ])

      setMateriels(matRes.data || [])
      setSites(siteRes.data || [])
      setChantiers(chtRes.data || [])
      setTransfertsEnTransit(trRes.data || [])
    } catch (err: any) {
      console.warn('[BtpLogistique] Erreur chargement:', err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Alertes de documents obligatoires arrivant à expiration (< 30 jours ou dépassés)
  const documentsAlerts = useMemo(() => {
    const today = new Date().getTime()
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000

    return materiels.filter(m => {
      let hasAlert = false
      if (m.assurance_expiration) {
        const exp = new Date(m.assurance_expiration).getTime()
        if (exp - today < thirtyDaysMs) hasAlert = true
      }
      if (m.visite_technique_expiration) {
        const exp = new Date(m.visite_technique_expiration).getTime()
        if (exp - today < thirtyDaysMs) hasAlert = true
      }
      if (m.controle_securite_expiration) {
        const exp = new Date(m.controle_securite_expiration).getTime()
        if (exp - today < thirtyDaysMs) hasAlert = true
      }
      return hasAlert
    })
  }, [materiels])

  // Compteurs logistiques
  const totalParc = materiels.length
  const disponibles = materiels.filter(m => m.statut === 'DISPONIBLE').length
  const enChantier = materiels.filter(m => m.statut === 'AFFECTE_CHANTIER').length
  const enTransit = materiels.filter(m => m.statut === 'EN_TRANSIT').length
  const immobilises = materiels.filter(m => m.statut === 'IMMOBILISE' || m.statut === 'EN_PANNE' || m.statut === 'EN_MAINTENANCE').length

  const categories = useMemo(() => {
    const set = new Set<string>()
    materiels.forEach(m => {
      if (m.categorie) set.add(m.categorie)
    })
    return Array.from(set)
  }, [materiels])

  const filteredMateriels = useMemo(() => {
    return materiels.filter(m => {
      const matchSearch =
        m.code_materiel.toLowerCase().includes(search.toLowerCase()) ||
        m.designation.toLowerCase().includes(search.toLowerCase()) ||
        (m.marque && m.marque.toLowerCase().includes(search.toLowerCase())) ||
        (m.modele && m.modele.toLowerCase().includes(search.toLowerCase())) ||
        (m.immatriculation && m.immatriculation.toLowerCase().includes(search.toLowerCase()))
      const matchCat = selectedCategorie === 'ALL' || m.categorie === selectedCategorie
      const matchStat = selectedStatut === 'ALL' || m.statut === selectedStatut
      return matchSearch && matchCat && matchStat
    })
  }, [materiels, search, selectedCategorie, selectedStatut])

  return (
    <div className="space-y-6">
      {/* ── En-tête ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">
            <Layers className="w-3.5 h-3.5" />
            <span>Gestion Logistique Centralisée</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Disponibilité & Localisation du Parc BTP
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Supervision des mouvements, affectations chantiers, alertes réglementaires et suivi des compteurs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={`${prefix}/transferts-intersites`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md shadow-amber-600/20 transition cursor-pointer"
          >
            <Repeat className="w-4 h-4" />
            <span>Transférer un engin</span>
          </Link>
          <Link
            to={`${prefix}/chantiers-affectations`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition cursor-pointer"
          >
            <HardHat className="w-4 h-4" />
            <span>Affecter à un chantier</span>
          </Link>
        </div>
      </div>

      {/* ── Cartes Synthèse Logistique ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[11px] font-bold uppercase text-slate-400">Total Flotte</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">{totalParc}</p>
          <p className="text-[11px] text-slate-400 mt-1">Engins & Camions</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[11px] font-bold uppercase text-emerald-500">Disponibles</p>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{disponibles}</p>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">Prêts à l'emploi</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[11px] font-bold uppercase text-blue-500">En Chantier</p>
          <p className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-0.5">{enChantier}</p>
          <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1">En production</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[11px] font-bold uppercase text-amber-500">En Transit</p>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-0.5">{enTransit}</p>
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">Sur porte-char</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm col-span-2 sm:col-span-1">
          <p className="text-[11px] font-bold uppercase text-red-500">Immobilisés / Pannes</p>
          <p className="text-2xl font-black text-red-600 dark:text-red-400 mt-0.5">{immobilises}</p>
          <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">Atelier & Dépannage</p>
        </div>
      </div>

      {/* ── Bandeau Alertes Documents Réglementaires ── */}
      {documentsAlerts.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 flex items-center justify-center flex-shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                Vigilance Documents : {documentsAlerts.length} engin(s) concerné(s)
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Certains contrats d'assurance, visites techniques ou contrôles de sécurité expirent sous 30 jours ou sont échus.
              </p>
            </div>
          </div>
          <Link
            to={`${prefix}/assurances-sinistres`}
            className="px-3.5 py-1.5 rounded-xl bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 whitespace-nowrap self-start sm:self-auto cursor-pointer"
          >
            Vérifier les assurances
          </Link>
        </div>
      )}

      {/* ── Filtres & Recherche ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher code, désignation, immatriculation..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <select
            value={selectedCategorie}
            onChange={e => setSelectedCategorie(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
          >
            <option value="ALL">Toutes les catégories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={selectedStatut}
            onChange={e => setSelectedStatut(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="DISPONIBLE">Disponible</option>
            <option value="AFFECTE_CHANTIER">Affecté à un chantier</option>
            <option value="EN_TRANSIT">En transit</option>
            <option value="EN_MAINTENANCE">En maintenance</option>
            <option value="EN_PANNE">En panne</option>
            <option value="IMMOBILISE">Immobilisé</option>
          </select>
        </div>
      </div>

      {/* ── Grille du Parc Matériel ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full p-12 text-center">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-slate-400">Chargement de la flotte matériels...</p>
          </div>
        ) : filteredMateriels.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
            <Truck className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Aucun engin trouvé</p>
            <p className="text-xs text-slate-400 mt-1">Ajustez vos filtres ou ajoutez des engins au parc matériel.</p>
          </div>
        ) : (
          filteredMateriels.map(m => {
            const isDisp = m.statut === 'DISPONIBLE'
            const isChant = m.statut === 'AFFECTE_CHANTIER'
            const isTransit = m.statut === 'EN_TRANSIT'
            const isPanne = m.statut === 'EN_PANNE' || m.statut === 'EN_MAINTENANCE' || m.statut === 'IMMOBILISE'

            return (
              <div
                key={m.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                        {m.code_materiel}
                      </span>
                      <h3 className="font-black text-sm text-slate-900 dark:text-white mt-1">
                        {m.marque} {m.modele}
                      </h3>
                      <p className="text-xs text-slate-500">{m.designation}</p>
                    </div>

                    <span
                      className={clsx(
                        'px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider',
                        isDisp && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
                        isChant && 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400',
                        isTransit && 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 animate-pulse',
                        isPanne && 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400'
                      )}
                    >
                      {m.statut.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span>Localisation : <strong>{m.site_nom || 'Base principale'}</strong></span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span>
                        Compteur : <strong>{m.type_compteur === 'HEURES_MOTEUR' ? `${m.compteur_heures_actuel} h` : `${m.compteur_km_actuel} km`}</strong>
                      </span>
                    </div>

                    {m.conducteur_habituel_nom && (
                      <div className="flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span>Conducteur : <strong>{m.conducteur_habituel_nom}</strong></span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-slate-400 uppercase font-bold">
                    {m.categorie}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <Link
                      to={`${prefix}/parc-materiel`}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[11px]"
                    >
                      Fiche complète
                    </Link>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default BtpLogistiquePage
