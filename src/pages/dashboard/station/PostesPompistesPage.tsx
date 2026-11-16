// =============================================================================
// GESTIO 229 — Station-Service & Hydrocarbures : Postes Pompistes & Shifts
// =============================================================================
// Circuit complet : OUVERTURE DE SHIFT → AFFECTATION POMPES/CUVES →
// VENTES DISTRIBUTEUR → CLÔTURE & RÉCONCILIATION ESPÈCES/MOMO → CAISSE
// Isolation stricte : company_id + sector_slug = 'station-service'
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  UserCog, UserCheck, Clock, CheckCircle, AlertTriangle, RefreshCw, Plus,
  DollarSign, Smartphone, CreditCard, ChevronRight, X, Search, FileText,
  Play, Gauge, Fuel, CheckCircle2, ShieldCheck, AlertCircle
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { safeStationInsert } from '../../../utils/stationFuelHelper'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { showModal } from '../../../components/modals/CustomModalGestio'
import {
  loadFuelCommercialConfigs,
  FuelCommercialConfig,
  loadOperationalCuves,
  StationCuve,
  openPompisteShift,
  getOpenShifts,
  getShiftSalesSummary,
  cloturerPompisteShift,
  StationShiftRecord
} from '../../../services/stationFuelService'

interface Pompiste {
  id: string
  matricule: string
  nom_complet: string
  telephone: string
  statut: string
  shift_habituel: string
  solde_responsabilite: number
}

interface Pompe {
  id: string
  numero_pompe: string
  type_carburant: string
  cuve_id?: string
  cuve_associee?: string
  index_actuel: number
}

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))
const fmtVol = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n || 0) + ' L'

export const PostesPompistesPage: React.FC = () => {
  const { companyId, sectorSlug, company, user } = useTenant()
  const { toast } = useUIStore() as any

  const [activeTab, setActiveTab] = useState<'shifts' | 'equipe'>('shifts')
  const [loading, setLoading] = useState(true)

  // Données de base
  const [pompistes, setPompistes] = useState<Pompiste[]>([])
  const [cuves, setCuves] = useState<StationCuve[]>([])
  const [pompes, setPompes] = useState<Pompe[]>([])
  const [fuelConfigs, setFuelConfigs] = useState<FuelCommercialConfig[]>([])
  const [openShifts, setOpenShifts] = useState<StationShiftRecord[]>([])
  const [closedShifts, setClosedShifts] = useState<StationShiftRecord[]>([])

  // Modales
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false)
  const [showClotureModal, setShowClotureModal] = useState(false)
  const [showPompisteModal, setShowPompisteModal] = useState(false)

  // Sélection pour clôture
  const [selectedShiftToCloture, setSelectedShiftToCloture] = useState<StationShiftRecord | null>(null)
  const [isCloturingShift, setIsCloturingShift] = useState(false)
  const [isOpeningShift, setIsOpeningShift] = useState(false)
  const [isSavingPompiste, setIsSavingPompiste] = useState(false)
  const [isLoadingSummary, setIsLoadingSummary] = useState(false)

  // Formulaire Ouverture Shift
  const [openShiftForm, setOpenShiftForm] = useState({
    pompiste_id: '',
    pompe_id: '',
    cuve_id: '',
    type_shift: 'Matin',
    date: new Date().toISOString().slice(0, 10),
    heure_ouverture: new Date().toTimeString().slice(0, 5),
    index_debut: 0,
  })

  // Formulaire Clôture Shift
  const [clotureForm, setClotureForm] = useState({
    index_fin: 0,
    montant_especes_remis: 0,
    montant_momo_confirme: 0,
    montant_credit: 0,
    motif_ecart: '',
    valide_par: 'Chef de piste'
  })

  // Récapitulatif réel des ventes du shift calculé à la clôture
  const [shiftSalesSummary, setShiftSalesSummary] = useState<{
    volumeTotal: number
    caTheorique: number
    montantEspeces: number
    montantMoMo: number
    montantCredit: number
    nbVentes: number
  }>({
    volumeTotal: 0,
    caTheorique: 0,
    montantEspeces: 0,
    montantMoMo: 0,
    montantCredit: 0,
    nbVentes: 0
  })

  // Formulaire Nouveau Pompiste
  const [pompisteForm, setPompisteForm] = useState({
    matricule: '',
    nom_complet: '',
    telephone: '',
    shift_habituel: 'Matin',
    solde_responsabilite: 0
  })

  const notify = useCallback((type: 'success' | 'error', msg: string) => {
    try {
      if (toast?.[type]) toast[type](msg)
      else if (type === 'error') {
        showModal({
          type: 'error',
          title: 'Erreur Pompiste',
          message: msg,
          domaine: 'www.gestio229.com'
        })
      }
    } catch { /* noop */ }
  }, [toast])

  // ─── Chargement global des données de piste ─────────────────────────────
  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const cleanSlug = sectorSlug || 'station-service'

      // 1. Pompistes
      const { data: pList } = await supabase
        .from('station_pompistes')
        .select('*')
        .eq('company_id', companyId)
        .eq('sector_slug', cleanSlug)
        .order('nom_complet')
      setPompistes(pList || [])

      // 2. Cuves opérationnelles unifiées (source de vérité unique sans doublons)
      const cList = await loadOperationalCuves(companyId, cleanSlug)
      setCuves(cList || [])

      // 3. Pompes
      const { data: pmps } = await supabase
        .from('station_pompes')
        .select('id, numero_pompe, type_carburant, cuve_id, cuve_associee, index_actuel')
        .eq('company_id', companyId)
        .eq('sector_slug', cleanSlug)
        .order('numero_pompe')
      setPompes(pmps || [])

      // 4. Shifts
      const { data: sList } = await supabase
        .from('station_shifts_clotures')
        .select('*')
        .eq('company_id', companyId)
        .in('sector_slug', [cleanSlug, 'station-service', 'station'])
        .order('created_at', { ascending: false })
        .limit(150)

      const allShifts = (sList || []) as StationShiftRecord[]
      const active = allShifts.filter(s =>
        s.statut === 'OUVERT' || s.statut === 'EN_COURS' ||
        String(s.statut).toLowerCase() === 'ouvert' || String(s.statut).toLowerCase() === 'en_cours'
      )
      const closed = allShifts.filter(s =>
        s.statut !== 'OUVERT' && s.statut !== 'EN_COURS' &&
        String(s.statut).toLowerCase() !== 'ouvert' && String(s.statut).toLowerCase() !== 'en_cours'
      )

      setOpenShifts(active)
      setClosedShifts(closed)

      // 5. Tarifs officiels des carburants
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

  useEffect(() => { loadData() }, [loadData])

  // ─── Actions : Ouvrir un Shift Pompiste ──────────────────────────────────
  const handleOpenShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isOpeningShift) return
    if (!openShiftForm.pompiste_id) return notify('error', 'Veuillez sélectionner le pompiste')
    if (!openShiftForm.pompe_id) return notify('error', 'Veuillez sélectionner la pompe affectée')

    const pSel = pompistes.find(p => p.id === openShiftForm.pompiste_id)
    const pmpSel = pompes.find(p => p.id === openShiftForm.pompe_id)
    const cuveSel = cuves.find(c => c.id === openShiftForm.cuve_id)

    if (!pSel || !pmpSel) return

    setIsOpeningShift(true)
    try {
      const res = await openPompisteShift({
        companyId: companyId || '',
        sectorSlug,
        pompisteId: pSel.id,
        pompisteNom: pSel.nom_complet,
        pompeId: pmpSel.id,
        pompeNumero: pmpSel.numero_pompe,
        cuveId: cuveSel?.id || (pmpSel as any).cuve_id || undefined,
        cuveNom: cuveSel?.nom || (pmpSel as any).cuve_associee || undefined,
        produit: pmpSel.type_carburant,
        typeShift: openShiftForm.type_shift,
        indexDebut: Number(openShiftForm.index_debut),
        date: openShiftForm.date,
        heureOuverture: openShiftForm.heure_ouverture,
        ouvertPar: user?.name || user?.email || 'Chef de piste'
      })

      if (!res.success) {
        return notify('error', res.error || "Impossible d'ouvrir le shift")
      }

      notify('success', `Shift ouvert avec succès pour ${pSel.nom_complet} à la ${pmpSel.numero_pompe}`)
      setShowOpenShiftModal(false)
      loadData()
    } catch (err: any) {
      notify('error', err.message || "Erreur lors de l'ouverture du shift")
    } finally {
      setIsOpeningShift(false)
    }
  }

  // ─── Actions : Lancer la Clôture d'un Shift ──────────────────────────────
  const handleStartCloture = async (shift: StationShiftRecord) => {
    setSelectedShiftToCloture(shift)
    setIsLoadingSummary(true)
    setShowClotureModal(true)

    try {
      const summary = await getShiftSalesSummary(companyId || '', shift.id, shift.pompiste_id, shift.date)
      setShiftSalesSummary(summary)

      const expectedIndexFin = Math.round((Number(shift.index_debut) + summary.volumeTotal) * 1000) / 1000
      setClotureForm({
        index_fin: expectedIndexFin,
        montant_especes_remis: summary.montantEspeces,
        montant_momo_confirme: summary.montantMoMo,
        montant_credit: summary.montantCredit,
        motif_ecart: '',
        valide_par: user?.name || user?.email || 'Chef de piste'
      })
    } catch (err) {
      console.warn('Erreur récapitulatif ventes:', err)
    } finally {
      setIsLoadingSummary(false)
    }
  }

  // ─── Actions : Valider la Clôture Définitive et Intégrer à la Caisse ────
  const handleValidateCloture = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedShiftToCloture) return
    if (isCloturingShift) return

    const idxFin = Number(clotureForm.index_fin)
    const idxDeb = Number(selectedShiftToCloture.index_debut)
    if (idxFin < idxDeb) {
      return notify('error', `L'index de fin (${idxFin}) ne peut pas être inférieur à l'index de départ (${idxDeb})`)
    }

    setIsCloturingShift(true)
    try {
      const res = await cloturerPompisteShift({
        companyId: companyId || '',
        shiftId: selectedShiftToCloture.id,
        sectorSlug,
        indexFin: idxFin,
        montantEspecesRemis: Number(clotureForm.montant_especes_remis),
        montantMoMoConfirme: Number(clotureForm.montant_momo_confirme),
        montantCredit: Number(clotureForm.montant_credit),
        motifEcart: clotureForm.motif_ecart,
        validePar: clotureForm.valide_par,
      })

      if (!res.success) {
        return notify('error', res.error || 'Erreur lors de la clôture du shift')
      }

      notify('success', `Shift clôturé et encaissements Espèces & MoMo intégrés à la caisse !`)
      setShowClotureModal(false)
      setSelectedShiftToCloture(null)
      loadData()
    } catch (err: any) {
      notify('error', err.message || 'Erreur lors de la clôture')
    } finally {
      setIsCloturingShift(false)
    }
  }

  // ─── Actions : Enregistrer un Nouveau Pompiste ───────────────────────────
  const handleSavePompiste = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSavingPompiste) return
    if (!pompisteForm.nom_complet) return notify('error', 'Nom complet requis')
    setIsSavingPompiste(true)
    try {
      const cleanSlug = sectorSlug || 'station-service'
      const payload = {
        company_id: companyId,
        sector_slug: cleanSlug,
        matricule: pompisteForm.matricule || `PMP-${pompistes.length + 1}`,
        nom_complet: pompisteForm.nom_complet,
        telephone: pompisteForm.telephone,
        shift_habituel: pompisteForm.shift_habituel,
        solde_responsabilite: Number(pompisteForm.solde_responsabilite) || 0,
        statut: 'ACTIF'
      }
      const { error } = await safeStationInsert(supabase, 'station_pompistes', { ...payload, tenant_id: companyId })
      if (error) throw error

      notify('success', 'Pompiste enregistré avec succès')
      setShowPompisteModal(false)
      loadData()
    } catch (err: any) {
      notify('error', err.message || "Erreur lors de l'enregistrement")
    } finally {
      setIsSavingPompiste(false)
    }
  }

  // Calculs statistiques
  const totalVolumeVendu = closedShifts.reduce((s, sh) => s + Number(sh.volume_distribue || 0), 0)
  const totalCaTheorique = closedShifts.reduce((s, sh) => s + Number(sh.montant_theorique || 0), 0)
  const totalCaVerse = closedShifts.reduce((s, sh) => s + Number(sh.montant_verse || 0), 0)
  const totalEcarts = closedShifts.reduce((s, sh) => s + Number(sh.ecart || 0), 0)

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* ─── En-tête ─── */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 text-blue-700 rounded-2xl">
            <UserCog className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Postes Pompistes & Shifts</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Circuit d'ouverture, affectation des cuves & pompes, réconciliation des encaissements et intégration caisse
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
            title="Actualiser"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
          <button
            onClick={() => {
              setOpenShiftForm({
                pompiste_id: '',
                pompe_id: '',
                cuve_id: '',
                type_shift: 'Matin',
                date: new Date().toISOString().slice(0, 10),
                heure_ouverture: new Date().toTimeString().slice(0, 5),
                index_debut: 0,
              })
              setShowOpenShiftModal(true)
            }}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm"
          >
            <Play className="w-4 h-4" /> Ouvrir un Shift
          </button>
          <button
            onClick={() => setShowPompisteModal(true)}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm"
          >
            <UserCheck className="w-4 h-4" /> Nouveau Pompiste
          </button>
        </div>
      </div>

      {/* ─── Statistiques consolidées ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Volume Distribué Total</p>
          <p className="text-2xl font-black text-slate-900 font-mono mt-2">{fmtVol(totalVolumeVendu)}</p>
          <p className="text-[11px] text-slate-400 mt-1">{closedShifts.length} shift(s) clôturé(s)</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">CA Théorique Calculé</p>
          <p className="text-2xl font-black text-slate-900 font-mono mt-2">{fmt(totalCaTheorique)} F</p>
          <p className="text-[11px] text-slate-400 mt-1">D'après compteurs pompes</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Montant Réellement Versé</p>
          <p className="text-2xl font-black text-emerald-600 font-mono mt-2">{fmt(totalCaVerse)} F</p>
          <p className="text-[11px] text-slate-400 mt-1">Espèces + MoMo + Crédit</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Écart Net des Pompistes</p>
          <p className={`text-2xl font-black font-mono mt-2 ${totalEcarts < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {totalEcarts > 0 ? '+' : ''}{fmt(totalEcarts)} F
          </p>
          <p className="text-[11px] text-slate-400 mt-1">{totalEcarts < 0 ? 'Manquant à justifier' : 'Caisse équilibrée'}</p>
        </div>
      </div>

      {/* ─── SECTION 1 : SHIFTS ACTIFS EN COURS (SERVICE EN COURS) ─── */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="font-black text-slate-900 text-base">Shifts Pompistes en Cours ({openShifts.length})</h2>
          </div>
          <span className="text-xs text-slate-400">Pompistes actuellement en service sur la piste</span>
        </div>

        {openShifts.length === 0 ? (
          <div className="py-8 text-center bg-slate-50 rounded-2xl border border-slate-100 p-6">
            <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="font-bold text-slate-700 text-sm">Aucun shift actuellement ouvert</p>
            <p className="text-xs text-slate-400 mt-1 mb-3">
              Avant de commencer à distribuer du carburant, un shift doit être ouvert avec affectation de pompe et d'index.
            </p>
            <button
              onClick={() => setShowOpenShiftModal(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-2"
            >
              <Play className="w-3.5 h-3.5" /> Ouvrir un Shift maintenant
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {openShifts.map((sh) => (
              <div key={sh.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col justify-between hover:border-blue-400 transition">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg font-mono text-[11px] font-bold">
                      {sh.reference}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                      EN SERVICE
                    </span>
                  </div>

                  <h3 className="font-black text-slate-900 text-base">{sh.pompiste_nom}</h3>
                  <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                    <span className="font-bold text-slate-700">{sh.pompe_numero}</span>
                    <span>•</span>
                    <span className="text-orange-600 font-bold">{sh.produit}</span>
                  </div>

                  <div className="my-3 p-3 bg-white rounded-xl border border-slate-200 text-xs space-y-1 font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Cuve liée :</span>
                      <span className="font-bold text-slate-800">{sh.cuve_nom || 'Cuve Principale'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Index début :</span>
                      <span className="font-bold text-blue-700">{fmtVol(sh.index_debut)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Ouvert le :</span>
                      <span className="text-slate-600">{sh.date}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleStartCloture(sh)}
                  className="w-full mt-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Clock className="w-3.5 h-3.5" /> Clôturer ce Shift
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Barre d'onglets ─── */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveTab('shifts')}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'shifts' ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-2xl' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" /> Historique des Clôtures ({closedShifts.length})
        </button>

        <button
          onClick={() => setActiveTab('equipe')}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'equipe' ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-2xl' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <UserCheck className="w-4 h-4" /> Équipe des Pompistes ({pompistes.length})
        </button>
      </div>

      {/* ─── CONTENU ONGLETS ─── */}
      {activeTab === 'shifts' ? (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm">Journal des Shifts Clôturés</h3>
            <span className="text-xs text-slate-400">Validation des espèces, MoMo et mouvements de trésorerie</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase">
                <tr>
                  <th className="p-3">Réf / Date</th>
                  <th className="p-3">Pompiste</th>
                  <th className="p-3">Pompe / Cuve</th>
                  <th className="p-3 text-right">Index Début → Fin</th>
                  <th className="p-3 text-right">Volume</th>
                  <th className="p-3 text-right">CA Théorique</th>
                  <th className="p-3 text-right">Montant Versé</th>
                  <th className="p-3 text-right">Écart</th>
                  <th className="p-3">Encaissements</th>
                  <th className="p-3 text-center">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {closedShifts.map(s => {
                  const ecart = Number(s.ecart || 0)
                  return (
                    <tr key={s.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-900">{s.reference}</span>
                        <div className="text-[10px] text-slate-400">{s.date}</div>
                      </td>
                      <td className="p-3 font-bold text-slate-800">{s.pompiste_nom}</td>
                      <td className="p-3">
                        <span className="font-bold text-slate-900">{s.pompe_numero}</span>
                        <div className="text-[10px] text-orange-600 font-bold">{s.produit} {s.cuve_nom ? `(${s.cuve_nom})` : ''}</div>
                      </td>
                      <td className="p-3 text-right font-mono text-slate-600">
                        {fmtVol(s.index_debut)} → {fmtVol(s.index_fin)}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">{fmtVol(s.volume_distribue)}</td>
                      <td className="p-3 text-right font-mono text-slate-500">{fmt(s.montant_theorique)} F</td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-700">{fmt(s.montant_verse)} F</td>
                      <td className={`p-3 text-right font-mono font-black ${
                        ecart < 0 ? 'text-rose-600 bg-rose-50/50' : ecart > 0 ? 'text-blue-600' : 'text-emerald-600'
                      }`}>
                        {ecart > 0 ? '+' : ''}{fmt(ecart)} F
                      </td>
                      <td className="p-3 text-[10px] text-slate-500 whitespace-nowrap">
                        <span className="font-medium text-slate-700">Esp :</span> {fmt(s.montant_especes)} F<br />
                        <span className="font-medium text-slate-700">MoMo :</span> {fmt(s.montant_momo)} F
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          s.statut === 'VALIDE_AVEC_ECART' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {s.statut}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pompistes.map(p => {
            const hasActive = openShifts.some(sh => sh.pompiste_id === p.id)
            return (
              <div key={p.id} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="p-1.5 bg-blue-50 text-blue-700 rounded-xl font-mono text-xs font-bold">
                      {p.matricule}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      hasActive ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {hasActive ? 'En Shift' : p.statut}
                    </span>
                  </div>
                  <h3 className="font-black text-slate-900 text-base mt-2">{p.nom_complet}</h3>
                  <p className="text-xs text-slate-500">{p.telephone || 'Aucun numéro'}</p>

                  <div className="my-4 p-3 bg-slate-50 rounded-2xl space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Shift habituel :</span>
                      <span className="font-bold text-slate-700">{p.shift_habituel}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Solde responsabilité :</span>
                      <span className={`font-mono font-bold ${p.solde_responsabilite < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                        {fmt(p.solde_responsabilite)} F
                      </span>
                    </div>
                  </div>
                </div>

                {hasActive ? (
                  <button
                    onClick={() => {
                      const sh = openShifts.find(s => s.pompiste_id === p.id)
                      if (sh) handleStartCloture(sh)
                    }}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition text-center"
                  >
                    Clôturer le shift actif
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setOpenShiftForm(prev => ({ ...prev, pompiste_id: p.id }))
                      setShowOpenShiftModal(true)
                    }}
                    className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold transition text-center"
                  >
                    + Ouvrir un shift pour ce pompiste
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ─── MODALE 1 : OUVRIR UN SHIFT ─── */}
      {showOpenShiftModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 space-y-4 my-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-black text-slate-900 text-base flex items-center gap-2">
                <Play className="w-5 h-5 text-emerald-600" /> Ouvrir un Shift Pompiste
              </h2>
              <button onClick={() => setShowOpenShiftModal(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleOpenShiftSubmit} className="space-y-4">
              {/* Sélection Pompiste */}
              <div>
                <label className="text-xs font-bold text-slate-700">Pompiste responsable *</label>
                <select
                  required
                  value={openShiftForm.pompiste_id}
                  onChange={e => setOpenShiftForm({ ...openShiftForm, pompiste_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-bold text-slate-800"
                >
                  <option value="">— Sélectionner le pompiste —</option>
                  {pompistes.map(p => {
                    const isAlreadyOpen = openShifts.some(sh => sh.pompiste_id === p.id)
                    return (
                      <option key={p.id} value={p.id} disabled={isAlreadyOpen}>
                        {p.nom_complet} ({p.matricule}) {isAlreadyOpen ? '⚠️ (Shift déjà en cours)' : ''}
                      </option>
                    )
                  })}
                </select>
              </div>

              {/* Sélection Pompe & Produit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Pompe de travail *</label>
                  <select
                    required
                    value={openShiftForm.pompe_id}
                    onChange={e => {
                      const selPmp = pompes.find(p => p.id === e.target.value)
                      const linkedCuve = cuves.find(c =>
                        (selPmp?.cuve_id && c.id === selPmp.cuve_id) ||
                        (selPmp?.cuve_associee && c.nom?.toLowerCase() === selPmp.cuve_associee?.toLowerCase()) ||
                        (c.produit && selPmp?.type_carburant && c.produit.toLowerCase() === selPmp.type_carburant.toLowerCase())
                      )
                      setOpenShiftForm({
                        ...openShiftForm,
                        pompe_id: e.target.value,
                        cuve_id: linkedCuve?.id || openShiftForm.cuve_id,
                        index_debut: selPmp ? selPmp.index_actuel : openShiftForm.index_debut,
                      })
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-bold text-slate-800"
                  >
                    <option value="">— Choisir la pompe —</option>
                    {pompes.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.numero_pompe} ({p.type_carburant})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700">Cuve affectée *</label>
                  <select
                    required
                    value={openShiftForm.cuve_id}
                    onChange={e => setOpenShiftForm({ ...openShiftForm, cuve_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-bold text-slate-800"
                  >
                    <option value="">— Choisir la cuve —</option>
                    {cuves.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.nom} ({c.produit}) — Dispo : {fmtVol(c.stock_actuel)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Index de départ & Heure */}
              <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200 space-y-3">
                <p className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Relevé d'Index & Période</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700">Index de départ (Compteur)</label>
                    <input
                      type="number"
                      step="0.001"
                      required
                      value={openShiftForm.index_debut}
                      onChange={e => setOpenShiftForm({ ...openShiftForm, index_debut: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm border border-emerald-300 bg-white rounded-xl mt-1 font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700">Type de Shift</label>
                    <select
                      value={openShiftForm.type_shift}
                      onChange={e => setOpenShiftForm({ ...openShiftForm, type_shift: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-emerald-300 bg-white rounded-xl mt-1 font-bold"
                    >
                      <option value="Matin">Matin (06h - 14h)</option>
                      <option value="Apres-midi">Après-midi (14h - 22h)</option>
                      <option value="Nuit">Nuit (22h - 06h)</option>
                      <option value="Personnalise">Personnalisé</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700">Date d'ouverture</label>
                    <input
                      type="date"
                      value={openShiftForm.date}
                      onChange={e => setOpenShiftForm({ ...openShiftForm, date: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 bg-white rounded-xl mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700">Heure d'ouverture</label>
                    <input
                      type="time"
                      value={openShiftForm.heure_ouverture}
                      onChange={e => setOpenShiftForm({ ...openShiftForm, heure_ouverture: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 bg-white rounded-xl mt-1"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowOpenShiftModal(false)}
                  className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isOpeningShift}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5"
                >
                  {isOpeningShift ? 'Ouverture...' : 'Valider l\'Ouverture du Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODALE 2 : CLÔTURER LE SHIFT (AVEC VALIDATION SÉPARÉE ESPÈCES & MOMO) ─── */}
      {showClotureModal && selectedShiftToCloture && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl p-6 space-y-4 my-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-black text-slate-900 text-base flex items-center gap-2">
                  <Clock className="w-5 h-5 text-blue-600" /> Clôture & Réconciliation de Shift
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Réf : <span className="font-mono font-bold text-slate-800">{selectedShiftToCloture.reference}</span> • Pompiste : <span className="font-bold text-slate-800">{selectedShiftToCloture.pompiste_nom}</span>
                </p>
              </div>
              <button onClick={() => setShowClotureModal(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {isLoadingSummary ? (
              <div className="py-12 text-center">
                <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-500">Calcul des ventes et encaissements du shift...</p>
              </div>
            ) : (
              <form onSubmit={handleValidateCloture} className="space-y-4">
                {/* 1. Compteur Pompe & Volume */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Compteur Pompe : {selectedShiftToCloture.pompe_numero} ({selectedShiftToCloture.produit})
                    </p>
                    <span className="text-[11px] text-slate-500">
                      Ventes enregistrées : {shiftSalesSummary.nbVentes}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500">Index Début</label>
                      <div className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl mt-1 font-mono font-bold text-slate-700">
                        {fmtVol(selectedShiftToCloture.index_debut)}
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500">Index Fin (Clôture) *</label>
                      <input
                        type="number"
                        step="0.001"
                        required
                        value={clotureForm.index_fin}
                        onChange={e => setClotureForm({ ...clotureForm, index_fin: Number(e.target.value) })}
                        className="w-full px-3 py-2 text-sm border border-blue-400 bg-white rounded-xl mt-1 font-mono font-bold text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500">Volume Sorti</label>
                      <div className="px-3 py-2 text-sm bg-blue-100/50 border border-blue-200 rounded-xl mt-1 font-mono font-black text-blue-900">
                        {fmtVol(Math.max(0, Number(clotureForm.index_fin) - Number(selectedShiftToCloture.index_debut)))}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-slate-200 text-xs">
                    <span className="text-slate-500">CA Théorique attendu :</span>
                    <span className="font-mono font-black text-slate-900 text-sm">
                      {fmt(
                        Math.max(0, Number(clotureForm.index_fin) - Number(selectedShiftToCloture.index_debut)) *
                        (Number(selectedShiftToCloture.prix_litre) || 680)
                      )} FCFA
                    </span>
                  </div>
                </div>

                {/* 2. VALIDATION SÉPARÉE DES ENCAISSEMENTS (ESPÈCES & MOMO) */}
                <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200 space-y-3">
                  <p className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    Validation des Encaissements (Intégration Caisse Station)
                  </p>

                  {/* Volet A : ESPÈCES */}
                  <div className="p-3 bg-white rounded-xl border border-emerald-200/80 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 flex items-center gap-1.5">
                        <DollarSign className="w-4 h-4 text-emerald-600" /> Encaissement ESPÈCES
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Ventes espèces enregistrées : <strong>{fmt(shiftSalesSummary.montantEspeces)} F</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 items-center">
                      <div>
                        <label className="text-[10px] text-slate-500">Montant réellement remis par le pompiste (FCFA)</label>
                        <input
                          type="number"
                          value={clotureForm.montant_especes_remis}
                          onChange={e => setClotureForm({ ...clotureForm, montant_especes_remis: Number(e.target.value) })}
                          className="w-full px-3 py-1.5 text-sm border border-emerald-300 rounded-lg font-mono font-bold text-slate-900 mt-0.5"
                        />
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500">Écart Espèces :</span>
                        <p className={`font-mono font-bold text-sm ${
                          Number(clotureForm.montant_especes_remis) - shiftSalesSummary.montantEspeces < 0 ? 'text-rose-600' : 'text-emerald-700'
                        }`}>
                          {Number(clotureForm.montant_especes_remis) - shiftSalesSummary.montantEspeces > 0 ? '+' : ''}
                          {fmt(Number(clotureForm.montant_especes_remis) - shiftSalesSummary.montantEspeces)} F
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Volet B : MOBILE MONEY (MoMo) */}
                  <div className="p-3 bg-white rounded-xl border border-blue-200/80 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 flex items-center gap-1.5">
                        <Smartphone className="w-4 h-4 text-blue-600" /> Encaissement MOBILE MONEY (MoMo)
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Ventes MoMo enregistrées : <strong>{fmt(shiftSalesSummary.montantMoMo)} F</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 items-center">
                      <div>
                        <label className="text-[10px] text-slate-500">Montant MoMo confirmé / reçu (FCFA)</label>
                        <input
                          type="number"
                          value={clotureForm.montant_momo_confirme}
                          onChange={e => setClotureForm({ ...clotureForm, montant_momo_confirme: Number(e.target.value) })}
                          className="w-full px-3 py-1.5 text-sm border border-blue-300 rounded-lg font-mono font-bold text-slate-900 mt-0.5"
                        />
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500">Écart MoMo :</span>
                        <p className={`font-mono font-bold text-sm ${
                          Number(clotureForm.montant_momo_confirme) - shiftSalesSummary.montantMoMo < 0 ? 'text-rose-600' : 'text-blue-700'
                        }`}>
                          {Number(clotureForm.montant_momo_confirme) - shiftSalesSummary.montantMoMo > 0 ? '+' : ''}
                          {fmt(Number(clotureForm.montant_momo_confirme) - shiftSalesSummary.montantMoMo)} F
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Synthèse globale des versements */}
                  {(() => {
                    const volSorti = Math.max(0, Number(clotureForm.index_fin) - Number(selectedShiftToCloture.index_debut))
                    const caTh = volSorti * (Number(selectedShiftToCloture.prix_litre) || 680)
                    const totalVerse = Number(clotureForm.montant_especes_remis || 0) + Number(clotureForm.montant_momo_confirme || 0) + Number(clotureForm.montant_credit || 0)
                    const ecartGlobal = totalVerse - caTh

                    return (
                      <div className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                        ecartGlobal < 0 ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-emerald-100 border-emerald-300 text-emerald-900'
                      }`}>
                        <div>
                          <span className="font-bold">Total reversé validé : {fmt(totalVerse)} FCFA</span>
                          <div className="text-[11px] text-slate-600">
                            {ecartGlobal < 0 ? '⚠️ Manquant global constaté sur ce shift' : ecartGlobal > 0 ? 'Excédent global constaté' : '✓ Shift parfaitement équilibré'}
                          </div>
                        </div>
                        <span className={`font-mono text-base font-black ${ecartGlobal < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                          {ecartGlobal > 0 ? '+' : ''}{fmt(ecartGlobal)} F
                        </span>
                      </div>
                    )
                  })()}
                </div>

                {/* Motif / Justification en cas d'écart */}
                <div>
                  <label className="text-xs font-bold text-slate-700">Motif ou Justification de l'écart (le cas échéant)</label>
                  <textarea
                    rows={2}
                    placeholder="Justification en cas de manquant ou excédent…"
                    value={clotureForm.motif_ecart}
                    onChange={e => setClotureForm({ ...clotureForm, motif_ecart: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl mt-1"
                  />
                </div>

                <div className="pt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowClotureModal(false)}
                    className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isCloturingShift}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5"
                  >
                    {isCloturingShift ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Clôture et intégration caisse...</span>
                      </>
                    ) : (
                      <span>Valider la Clôture Définitive</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ─── MODALE 3 : NOUVEAU POMPISTE ─── */}
      {showPompisteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-black text-slate-900 text-base">Nouveau Pompiste</h2>
              <button onClick={() => setShowPompisteModal(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleSavePompiste} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700">Matricule</label>
                <input
                  type="text"
                  placeholder="Ex: PMP-01"
                  value={pompisteForm.matricule}
                  onChange={e => setPompisteForm({ ...pompisteForm, matricule: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700">Nom complet *</label>
                <input
                  type="text"
                  placeholder="Ex: Koffi Mensah"
                  required
                  value={pompisteForm.nom_complet}
                  onChange={e => setPompisteForm({ ...pompisteForm, nom_complet: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700">Téléphone</label>
                <input
                  type="text"
                  placeholder="+229 97 00 00 00"
                  value={pompisteForm.telephone}
                  onChange={e => setPompisteForm({ ...pompisteForm, telephone: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700">Shift assigné</label>
                <select
                  value={pompisteForm.shift_habituel}
                  onChange={e => setPompisteForm({ ...pompisteForm, shift_habituel: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-bold text-slate-800"
                >
                  <option value="Matin">Shift Matin (06h - 14h)</option>
                  <option value="Apres-midi">Shift Après-midi (14h - 22h)</option>
                  <option value="Nuit">Shift Nuit (22h - 06h)</option>
                  <option value="Personnalise">Shift Personnalisé</option>
                </select>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPompisteModal(false)}
                  className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSavingPompiste}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm"
                >
                  {isSavingPompiste ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default PostesPompistesPage
