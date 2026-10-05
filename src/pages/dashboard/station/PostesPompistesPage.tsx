// =============================================================================
// GESTIO 229 — Station-Service & Hydrocarbures : Postes Pompistes & Shifts
// =============================================================================
// Suivi des shifts, relèves compteurs, encaissements et calcul des écarts
// Isolation stricte : company_id + sector_slug = 'station-service'
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  UserCog, UserCheck, Clock, CheckCircle, AlertTriangle, RefreshCw, Plus,
  DollarSign, Smartphone, CreditCard, ChevronRight, X, Search, FileText
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'

interface Pompiste {
  id: string
  matricule: string
  nom_complet: string
  telephone: string
  statut: string
  shift_habituel: string
  solde_responsabilite: number
}

interface ShiftCloture {
  id: string
  reference: string
  date: string
  type_shift: string
  pompiste_id: string
  pompiste_nom: string
  pompe_numero: string
  produit: string
  index_debut: number
  index_fin: number
  volume_distribue: number
  prix_litre: number
  montant_theorique: number
  montant_verse: number
  montant_especes: number
  montant_momo: number
  montant_credit: number
  ecart: number
  motif_ecart?: string
  valide_par?: string
  statut: string
}

interface Pompe {
  id: string
  numero_pompe: string
  type_carburant: string
  index_actuel: number
}

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))
const fmtVol = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n || 0) + ' L'

export const PostesPompistesPage: React.FC = () => {
  const { companyId, sectorSlug } = useTenant()
  const { toast } = useUIStore() as any

  const [activeTab, setActiveTab] = useState<'shifts' | 'equipe'>('shifts')
  const [loading, setLoading] = useState(true)

  const [pompistes, setPompistes] = useState<Pompiste[]>([])
  const [shifts, setShifts] = useState<ShiftCloture[]>([])
  const [pompes, setPompes] = useState<Pompe[]>([])

  // Modales
  const [showShiftModal, setShowShiftModal] = useState(false)
  const [showPompisteModal, setShowPompisteModal] = useState(false)

  // Formulaire Shift
  const [shiftForm, setShiftForm] = useState({
    pompiste_id: '',
    pompe_id: '',
    type_shift: 'Matin',
    date: new Date().toISOString().slice(0, 10),
    index_debut: 0,
    index_fin: 0,
    prix_litre: 650,
    montant_especes: 0,
    montant_momo: 0,
    montant_credit: 0,
    motif_ecart: '',
    valide_par: 'Chef de piste'
  })

  // Formulaire Pompiste
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
      else if (type === 'error') window.alert(msg)
    } catch { /* noop */ }
  }, [toast])

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const cleanSlug = sectorSlug || 'station-service'

      // Pompistes
      const { data: pList } = await supabase
        .from('station_pompistes')
        .select('*')
        .eq('company_id', companyId)
        .eq('sector_slug', cleanSlug)
        .order('nom_complet')
      setPompistes(pList || [])

      // Shifts
      const { data: sList } = await supabase
        .from('station_shifts_clotures')
        .select('*')
        .eq('company_id', companyId)
        .eq('sector_slug', cleanSlug)
        .order('created_at', { ascending: false })
        .limit(100)
      setShifts(sList || [])

      // Pompes pour le formulaire
      const { data: pmps } = await supabase
        .from('station_pompes')
        .select('id, numero_pompe, type_carburant, index_actuel')
        .eq('company_id', companyId)
        .eq('sector_slug', cleanSlug)
      setPompes(pmps || [])

    } catch (err: any) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [companyId, sectorSlug])

  useEffect(() => { loadData() }, [loadData])

  // ─── Enregistrer un Nouveau Pompiste ─────────────────────────────────────
  const handleSavePompiste = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pompisteForm.nom_complet) return notify('error', 'Nom complet requis')
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
      const { error } = await supabase.from('station_pompistes').insert(payload)
      if (error) throw error

      notify('success', 'Pompiste enregistré avec succès')
      setShowPompisteModal(false)
      loadData()
    } catch (err: any) {
      notify('error', err.message || 'Erreur lors de l\'enregistrement')
    }
  }

  // ─── Clôturer un Shift ───────────────────────────────────────────────────
  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!shiftForm.pompiste_id || !shiftForm.pompe_id) {
      return notify('error', 'Sélectionnez le pompiste et la pompe')
    }

    const pompeSel = pompes.find(p => p.id === shiftForm.pompe_id)
    const pompisteSel = pompistes.find(p => p.id === shiftForm.pompiste_id)
    if (!pompeSel || !pompisteSel) return

    const volDistribue = Number(shiftForm.index_fin) - Number(shiftForm.index_debut)
    if (volDistribue < 0) {
      return notify('error', "L'index de fin ne peut pas être inférieur à l'index de début")
    }

    const caTheorique = volDistribue * Number(shiftForm.prix_litre)
    const totalVerse = Number(shiftForm.montant_especes || 0) + Number(shiftForm.montant_momo || 0) + Number(shiftForm.montant_credit || 0)
    const ecart = totalVerse - caTheorique // négatif = manquant

    try {
      const cleanSlug = sectorSlug || 'station-service'
      const payload = {
        company_id: companyId,
        sector_slug: cleanSlug,
        date: shiftForm.date,
        type_shift: shiftForm.type_shift,
        pompiste_id: pompisteSel.id,
        pompiste_nom: pompisteSel.nom_complet,
        pompe_id: pompeSel.id,
        pompe_numero: pompeSel.numero_pompe,
        produit: pompeSel.type_carburant,
        index_debut: Number(shiftForm.index_debut),
        index_fin: Number(shiftForm.index_fin),
        volume_distribue: volDistribue,
        prix_litre: Number(shiftForm.prix_litre),
        montant_theorique: caTheorique,
        montant_verse: totalVerse,
        montant_especes: Number(shiftForm.montant_especes || 0),
        montant_momo: Number(shiftForm.montant_momo || 0),
        montant_credit: Number(shiftForm.montant_credit || 0),
        ecart: ecart,
        motif_ecart: shiftForm.motif_ecart,
        valide_par: shiftForm.valide_par,
        statut: ecart < 0 ? 'VALIDE_AVEC_ECART' : 'CLOTURE'
      }

      const { error } = await supabase.from('station_shifts_clotures').insert(payload)
      if (error) throw error

      // Mettre à jour l'index actuel de la pompe
      await supabase
        .from('station_pompes')
        .update({ index_actuel: Number(shiftForm.index_fin) })
        .eq('id', pompeSel.id)

      notify('success', `Shift clôturé ! Écart : ${ecart >= 0 ? '+' : ''}${fmt(ecart)} FCFA`)
      setShowShiftModal(false)
      loadData()
    } catch (err: any) {
      notify('error', err.message || 'Erreur lors de la clôture')
    }
  }

  // Calculs statistiques
  const totalVolumeVendu = shifts.reduce((s, sh) => s + Number(sh.volume_distribue || 0), 0)
  const totalCaTheorique = shifts.reduce((s, sh) => s + Number(sh.montant_theorique || 0), 0)
  const totalCaVerse = shifts.reduce((s, sh) => s + Number(sh.montant_verse || 0), 0)
  const totalEcarts = shifts.reduce((s, sh) => s + Number(sh.ecart || 0), 0)

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
              Gestion des relèves d'index, contrôle des volumes distribués et réconciliation des encaissements
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
            onClick={() => setShowPompisteModal(true)}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm"
          >
            <UserCheck className="w-4 h-4" /> Nouveau Pompiste
          </button>
          <button
            onClick={() => setShowShiftModal(true)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" /> Clôturer un Shift
          </button>
        </div>
      </div>

      {/* ─── Statistiques ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Volume Distribué Total</p>
          <p className="text-2xl font-black text-slate-900 font-mono mt-2">{fmtVol(totalVolumeVendu)}</p>
          <p className="text-[11px] text-slate-400 mt-1">{shifts.length} shift(s) comptabilisé(s)</p>
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

      {/* ─── Barre d'onglets ─── */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveTab('shifts')}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'shifts' ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-2xl' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" /> Relèves & Clôtures de Shift ({shifts.length})
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
            <h3 className="font-bold text-slate-800 text-sm">Historique des Clôtures de Shifts</h3>
            <span className="text-xs text-slate-400">Contrôle fin d'index vs versement caisse</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase">
                <tr>
                  <th className="p-3">Réf / Date</th>
                  <th className="p-3">Pompiste</th>
                  <th className="p-3">Shift</th>
                  <th className="p-3">Pompe / Produit</th>
                  <th className="p-3 text-right">Index Début → Fin</th>
                  <th className="p-3 text-right">Volume</th>
                  <th className="p-3 text-right">CA Théorique</th>
                  <th className="p-3 text-right">Montant Versé</th>
                  <th className="p-3 text-right">Écart</th>
                  <th className="p-3">Détail Encaissement</th>
                  <th className="p-3 text-center">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shifts.map(s => {
                  const ecart = Number(s.ecart || 0)
                  return (
                    <tr key={s.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-900">{s.reference}</span>
                        <div className="text-[10px] text-slate-400">{s.date}</div>
                      </td>
                      <td className="p-3 font-bold text-slate-800">{s.pompiste_nom}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 bg-slate-100 rounded-lg font-bold text-slate-600 text-[10px]">
                          {s.type_shift}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-bold text-slate-900">{s.pompe_numero}</span>
                        <div className="text-[10px] text-orange-600 font-bold">{s.produit}</div>
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
                        Esp: {fmt(s.montant_especes)} | MoMo: {fmt(s.montant_momo)} | Crd: {fmt(s.montant_credit)}
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
          {pompistes.map(p => (
            <div key={p.id} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="p-1.5 bg-blue-50 text-blue-700 rounded-xl font-mono text-xs font-bold">
                    {p.matricule}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    {p.statut}
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

              <button
                onClick={() => {
                  setShiftForm(prev => ({ ...prev, pompiste_id: p.id }))
                  setShowShiftModal(true)
                }}
                className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold transition text-center"
              >
                Clôturer shift pour ce pompiste
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ─── MODALE NOUVEAU POMPISTE ─── */}
      {showPompisteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-black text-slate-900 text-base">Nouveau Pompiste</h2>
              <button onClick={() => setShowPompisteModal(false)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
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
                <label className="text-xs font-bold text-slate-700">Nom Complet *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Koffi Mensah"
                  value={pompisteForm.nom_complet}
                  onChange={e => setPompisteForm({ ...pompisteForm, nom_complet: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700">Téléphone</label>
                <input
                  type="tel"
                  placeholder="+229 ..."
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
                <button type="button" onClick={() => setShowPompisteModal(false)} className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODALE CLÔTURE DE SHIFT ─── */}
      {showShiftModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl p-6 space-y-4 my-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-black text-slate-900 text-base flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" /> Relève & Clôture de Shift Pompiste
              </h2>
              <button onClick={() => setShowShiftModal(false)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSaveShift} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Pompiste *</label>
                  <select
                    required
                    value={shiftForm.pompiste_id}
                    onChange={e => setShiftForm({ ...shiftForm, pompiste_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-bold text-slate-800"
                  >
                    <option value="">— Choisir le pompiste —</option>
                    {pompistes.map(p => (
                      <option key={p.id} value={p.id}>{p.nom_complet} ({p.matricule})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Pompe exploitée *</label>
                  <select
                    required
                    value={shiftForm.pompe_id}
                    onChange={e => {
                      const sel = pompes.find(p => p.id === e.target.value)
                      setShiftForm({
                        ...shiftForm,
                        pompe_id: e.target.value,
                        index_debut: sel ? sel.index_actuel : shiftForm.index_debut,
                        index_fin: sel ? sel.index_actuel : shiftForm.index_fin
                      })
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-bold text-slate-800"
                  >
                    <option value="">— Choisir la pompe —</option>
                    {pompes.map(p => (
                      <option key={p.id} value={p.id}>{p.numero_pompe} ({p.type_carburant})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Shift</label>
                  <select
                    value={shiftForm.type_shift}
                    onChange={e => setShiftForm({ ...shiftForm, type_shift: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1 font-bold"
                  >
                    <option value="Matin">Matin (06h - 14h)</option>
                    <option value="Apres-midi">Après-midi (14h - 22h)</option>
                    <option value="Nuit">Nuit (22h - 06h)</option>
                    <option value="Personnalise">Personnalisé</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Date</label>
                  <input
                    type="date"
                    value={shiftForm.date}
                    onChange={e => setShiftForm({ ...shiftForm, date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1"
                  />
                </div>
              </div>

              {/* Index & Volume */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Compteur Pompe (Litres)</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500">Index Début (Prise)</label>
                    <input
                      type="number"
                      step="0.001"
                      required
                      value={shiftForm.index_debut}
                      onChange={e => setShiftForm({ ...shiftForm, index_debut: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 bg-white rounded-xl mt-1 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500">Index Fin (Clôture)</label>
                    <input
                      type="number"
                      step="0.001"
                      required
                      value={shiftForm.index_fin}
                      onChange={e => setShiftForm({ ...shiftForm, index_fin: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 bg-white rounded-xl mt-1 font-mono font-bold text-blue-700"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500">Volume Sorti</label>
                    <div className="px-3 py-2 text-sm bg-blue-100/50 border border-blue-200 rounded-xl mt-1 font-mono font-black text-blue-900">
                      {fmtVol(Math.max(0, Number(shiftForm.index_fin) - Number(shiftForm.index_debut)))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500">Prix au Litre appliqué (FCFA)</label>
                    <input
                      type="number"
                      value={shiftForm.prix_litre}
                      onChange={e => setShiftForm({ ...shiftForm, prix_litre: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 bg-white rounded-xl mt-1 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500">CA Théorique à rendre</label>
                    <div className="px-3 py-2 text-sm bg-slate-900 text-emerald-400 rounded-xl mt-1 font-mono font-black">
                      {fmt(Math.max(0, Number(shiftForm.index_fin) - Number(shiftForm.index_debut)) * Number(shiftForm.prix_litre))} F
                    </div>
                  </div>
                </div>
              </div>

              {/* Encaissement réel */}
              <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200/80 space-y-3">
                <p className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Montants Réellement Encaissés / Reversés</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                      <DollarSign className="w-3 h-3 text-emerald-600" /> Espèces
                    </label>
                    <input
                      type="number"
                      value={shiftForm.montant_especes}
                      onChange={e => setShiftForm({ ...shiftForm, montant_especes: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm border border-emerald-200 bg-white rounded-xl mt-1 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                      <Smartphone className="w-3 h-3 text-emerald-600" /> MoMo / Moov
                    </label>
                    <input
                      type="number"
                      value={shiftForm.montant_momo}
                      onChange={e => setShiftForm({ ...shiftForm, montant_momo: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm border border-emerald-200 bg-white rounded-xl mt-1 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                      <CreditCard className="w-3 h-3 text-emerald-600" /> Bons / Crédits
                    </label>
                    <input
                      type="number"
                      value={shiftForm.montant_credit}
                      onChange={e => setShiftForm({ ...shiftForm, montant_credit: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm border border-emerald-200 bg-white rounded-xl mt-1 font-mono font-bold"
                    />
                  </div>
                </div>

                {/* Calcul Écart Instantané */}
                {(() => {
                  const vol = Math.max(0, Number(shiftForm.index_fin) - Number(shiftForm.index_debut))
                  const caTh = vol * Number(shiftForm.prix_litre)
                  const verse = Number(shiftForm.montant_especes || 0) + Number(shiftForm.montant_momo || 0) + Number(shiftForm.montant_credit || 0)
                  const ecart = verse - caTh

                  return (
                    <div className={`p-3 rounded-2xl border text-xs flex items-center justify-between ${
                      ecart < 0 ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-emerald-100 border-emerald-300 text-emerald-900'
                    }`}>
                      <div>
                        <span className="font-bold">Total reversé : {fmt(verse)} FCFA</span>
                        <div className="text-[11px] text-slate-600">
                          {ecart < 0 ? '⚠️ Manquant constaté (écart de caisse)' : ecart > 0 ? 'Excédent constaté' : '✓ Caisse parfaitement équilibrée'}
                        </div>
                      </div>
                      <span className={`font-mono text-base font-black ${ecart < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {ecart > 0 ? '+' : ''}{fmt(ecart)} F
                      </span>
                    </div>
                  )
                })()}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Motif ou Justification de l'écart</label>
                <textarea
                  rows={2}
                  placeholder="Obligatoire en cas de manquant…"
                  value={shiftForm.motif_ecart}
                  onChange={e => setShiftForm({ ...shiftForm, motif_ecart: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mt-1"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setShowShiftModal(false)} className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600">Annuler</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm">Valider la Clôture</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
export default PostesPompistesPage
