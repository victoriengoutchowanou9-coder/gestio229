// =============================================================================
// GESTIO 229 SaaS — Mouvements & Transferts Intersites BTP
// Conforme Spécification Section Logistique 2.3
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Repeat, Plus, Search, MapPin, Truck, ArrowRight,
  CheckCircle2, Clock, AlertTriangle, DollarSign, X,
  ShieldCheck, FileText, ChevronRight, User, Calendar
} from 'lucide-react'
import { useTenant } from '../../../../hooks/useTenant'
import { useUIStore } from '../../../../store/uiStore'
import { formatFCFA } from '../../../../utils/tax'
import { BtpTransfertIntersite, BtpMateriel, BtpSite } from '../../../../services/garageService'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

export const BtpTransfertsPage: React.FC = () => {
  const { companyId, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [transferts, setTransferts] = useState<BtpTransfertIntersite[]>([])
  const [materiels, setMateriels] = useState<BtpMateriel[]>([])
  const [sites, setSites] = useState<BtpSite[]>([])
  const [search, setSearch] = useState('')
  const [filterStatut, setFilterStatut] = useState<string>('ALL')

  // Modale Nouveau Transfert
  const [showModal, setShowModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    materiel_id: '',
    site_origine_id: '',
    site_destination_id: '',
    type_transfert: 'MATERIEL' as 'MATERIEL' | 'PIECES_DETACHEES' | 'CARBURANT',
    transporteur_nom: '',
    moyen_transport: 'Porte-char interne',
    chauffeur_nom: '',
    cout_transport: 0,
    motif: '',
    notes: ''
  })

  // Modale Confirmation Réception
  const [receptionModal, setReceptionModal] = useState<BtpTransfertIntersite | null>(null)
  const [receptionForm, setReceptionForm] = useState({
    receptionne_par: '',
    etat_materiel: 'BON_ETAT',
    notes_reception: ''
  })

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [transRes, matRes, siteRes] = await Promise.all([
        supabaseTenant('btp_transferts_intersites').select('*').order('created_at', { ascending: false }),
        supabaseTenant('btp_materiels').select('*').order('code_materiel'),
        supabaseTenant('btp_sites').select('*').order('nom_site')
      ])

      setTransferts(transRes.data || [])
      setMateriels(matRes.data || [])
      setSites(siteRes.data || [])
    } catch (err: any) {
      console.warn('[BtpTransferts] Erreur chargement:', err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Pré-remplissage du site d'origine lorsque l'engin est sélectionné
  const handleMaterielSelect = (matId: string) => {
    const mat = materiels.find(m => m.id === matId)
    setForm(prev => ({
      ...prev,
      materiel_id: matId,
      site_origine_id: mat?.site_actuel_id || prev.site_origine_id
    }))
  }

  const handleCreateTransfert = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.site_origine_id || !form.site_destination_id) {
      toast.error('Champs requis', 'Veuillez spécifier le site d\'origine et le site de destination.')
      return
    }
    if (form.site_origine_id === form.site_destination_id) {
      toast.error('Sites identiques', 'Le site d\'origine et la destination doivent être différents.')
      return
    }

    setSubmitting(true)
    try {
      const numTrans = `TR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
      const payload: Partial<BtpTransfertIntersite> = {
        company_id: companyId || '',
        numero_transfert: numTrans,
        type_transfert: form.type_transfert,
        site_origine_id: form.site_origine_id,
        site_destination_id: form.site_destination_id,
        materiel_id: form.materiel_id || undefined,
        transporteur_nom: form.transporteur_nom || undefined,
        moyen_transport: form.moyen_transport,
        chauffeur_nom: form.chauffeur_nom || undefined,
        cout_transport: Number(form.cout_transport) || 0,
        motif: form.motif || undefined,
        notes: form.notes || undefined,
        date_expedition: new Date().toISOString(),
        statut: 'EN_TRANSIT'
      }

      const { data: newTr, error } = await supabaseTenant('btp_transferts_intersites')
        .insert([payload])
        .select()
        .single()

      if (error) throw error

      // Mettre à jour le statut du matériel en "EN_TRANSIT"
      if (form.materiel_id) {
        await supabaseTenant('btp_materiels')
          .update({
            statut: 'EN_TRANSIT',
            updated_at: new Date().toISOString()
          })
          .eq('id', form.materiel_id)
      }

      toast.success('Transfert initié', `Le bon ${numTrans} est en cours de transit.`)
      setShowModal(false)
      setForm({
        materiel_id: '',
        site_origine_id: '',
        site_destination_id: '',
        type_transfert: 'MATERIEL',
        transporteur_nom: '',
        moyen_transport: 'Porte-char interne',
        chauffeur_nom: '',
        cout_transport: 0,
        motif: '',
        notes: ''
      })
      loadData()
    } catch (err: any) {
      console.error('[BtpTransferts] Erreur création:', err)
      toast.error('Erreur', err?.message || 'Impossible d\'initier le transfert.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfirmerReception = async () => {
    if (!receptionModal) return
    setSubmitting(true)
    try {
      const destSite = sites.find(s => s.id === receptionModal.site_destination_id)
      const statutFinal = receptionForm.etat_materiel === 'AVEC_RESERVES' ? 'RECU_AVEC_RESERVES' : 'RECU'

      // 1. Mettre à jour le transfert
      const { error: trErr } = await supabaseTenant('btp_transferts_intersites')
        .update({
          statut: statutFinal,
          date_reception: new Date().toISOString(),
          receptionne_par: receptionForm.receptionne_par || 'Chef de chantier destination',
          notes: receptionModal.notes
            ? `${receptionModal.notes} | Réception: ${receptionForm.notes_reception}`
            : receptionForm.notes_reception
        })
        .eq('id', receptionModal.id)

      if (trErr) throw trErr

      // 2. Mettre à jour la localisation de l'engin et son statut
      if (receptionModal.materiel_id) {
        await supabaseTenant('btp_materiels')
          .update({
            site_actuel_id: receptionModal.site_destination_id,
            site_nom: destSite?.nom_site || undefined,
            statut: 'DISPONIBLE',
            updated_at: new Date().toISOString()
          })
          .eq('id', receptionModal.materiel_id)
      }

      toast.success('Réception validée', `L'engin est désormais affecté à ${destSite?.nom_site || 'sa nouvelle base'}.`)
      setReceptionModal(null)
      loadData()
    } catch (err: any) {
      console.error('[handleConfirmerReception] Erreur:', err)
      toast.error('Erreur', err?.message || 'Impossible de valider la réception.')
    } finally {
      setSubmitting(false)
    }
  }

  const getSiteNom = (id?: string) => {
    if (!id) return 'Non défini'
    const s = sites.find(x => x.id === id)
    return s ? `${s.nom_site} (${s.ville || 'Bénin'})` : 'Site inconnu'
  }

  const getMaterielNom = (id?: string) => {
    if (!id) return 'Pièces / Lot sans engin'
    const m = materiels.find(x => x.id === id)
    return m ? `${m.code_materiel} — ${m.marque} ${m.modele}` : 'Matériel inconnu'
  }

  const filteredTransferts = transferts.filter(t => {
    const matchSearch =
      t.numero_transfert.toLowerCase().includes(search.toLowerCase()) ||
      (t.chauffeur_nom && t.chauffeur_nom.toLowerCase().includes(search.toLowerCase())) ||
      (t.motif && t.motif.toLowerCase().includes(search.toLowerCase()))
    const matchStatut = filterStatut === 'ALL' || t.statut === filterStatut
    return matchSearch && matchStatut
  })

  return (
    <div className="space-y-6">
      {/* ── En-tête ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">
            <Repeat className="w-3.5 h-3.5" />
            <span>Logistique Flotte & Chantiers</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Mouvements & Transferts Intersites
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Traçabilité des déplacements d'engins, matériels et porte-chars entre bases, ateliers et chantiers.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-lg shadow-amber-600/20 transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Initier un transfert</span>
        </button>
      </div>

      {/* ── Cartes d'indicateurs ── */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs font-bold uppercase text-slate-400">Total Transferts</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{transferts.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs font-bold uppercase text-amber-500">En Transit</p>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
            {transferts.filter(t => t.statut === 'EN_TRANSIT').length}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs font-bold uppercase text-emerald-500">Réceptionnés</p>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {transferts.filter(t => t.statut === 'RECU' || t.statut === 'RECU_AVEC_RESERVES').length}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs font-bold uppercase text-blue-500">Coûts de Transport</p>
          <p className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
            {fmt(transferts.reduce((sum, t) => sum + (Number(t.cout_transport) || 0), 0))}
          </p>
        </div>
      </div>

      {/* ── Barre de recherche & Filtres ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par numéro, chauffeur, motif..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {['ALL', 'EN_TRANSIT', 'RECU', 'ANNULE'].map(st => (
            <button
              key={st}
              type="button"
              onClick={() => setFilterStatut(st)}
              className={clsx(
                'px-3 py-1.5 rounded-xl text-xs font-bold transition',
                filterStatut === st
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              )}
            >
              {st === 'ALL' && 'Tous'}
              {st === 'EN_TRANSIT' && 'En transit'}
              {st === 'RECU' && 'Réceptionnés'}
              {st === 'ANNULE' && 'Annulés'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Liste des Transferts ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-slate-400">Chargement des transferts intersites...</p>
          </div>
        ) : filteredTransferts.length === 0 ? (
          <div className="p-12 text-center">
            <Repeat className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Aucun mouvement enregistré</p>
            <p className="text-xs text-slate-400 mt-1">Cliquez sur "Initier un transfert" pour enregistrer un déplacement d'engin.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredTransferts.map(tr => (
              <div key={tr.id} className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-black px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                      {tr.numero_transfert}
                    </span>
                    <span
                      className={clsx(
                        'px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider',
                        tr.statut === 'EN_TRANSIT' && 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800',
                        tr.statut === 'RECU' && 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800',
                        tr.statut === 'RECU_AVEC_RESERVES' && 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-800',
                        tr.statut === 'ANNULE' && 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400'
                      )}
                    >
                      {tr.statut === 'EN_TRANSIT' && 'En Transit'}
                      {tr.statut === 'RECU' && 'Réceptionné'}
                      {tr.statut === 'RECU_AVEC_RESERVES' && 'Reçu avec réserves'}
                      {tr.statut === 'ANNULE' && 'Annulé'}
                    </span>
                    <span className="text-xs text-slate-400">
                      Expédié le {new Date(tr.date_expedition).toLocaleDateString('fr-FR')}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-sm font-bold text-slate-900 dark:text-white">
                    <Truck className="w-4 h-4 text-amber-600" />
                    <span>{getMaterielNom(tr.materiel_id)}</span>
                  </div>

                  {/* Parcours d'origine à destination */}
                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-semibold">{getSiteNom(tr.site_origine_id)}</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-amber-500" />
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">{getSiteNom(tr.site_destination_id)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400 pt-1">
                    {tr.chauffeur_nom && (
                      <span className="inline-flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        Chauffeur: <strong>{tr.chauffeur_nom}</strong>
                      </span>
                    )}
                    <span>Moyen: <strong>{tr.moyen_transport}</strong></span>
                    {Number(tr.cout_transport) > 0 && (
                      <span className="text-blue-600 dark:text-blue-400 font-bold">
                        Coût: {fmt(tr.cout_transport)}
                      </span>
                    )}
                    {tr.motif && <span>Motif: <em>{tr.motif}</em></span>}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end lg:self-center">
                  {tr.statut === 'EN_TRANSIT' && (
                    <button
                      type="button"
                      onClick={() => {
                        setReceptionModal(tr)
                        setReceptionForm({
                          receptionne_par: '',
                          etat_materiel: 'BON_ETAT',
                          notes_reception: ''
                        })
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Confirmer réception</span>
                    </button>
                  )}
                  {tr.statut === 'RECU' && (
                    <div className="text-right">
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        <ShieldCheck className="w-4 h-4" />
                        Reçu par {tr.receptionne_par || 'Destinataire'}
                      </span>
                      {tr.date_reception && (
                        <p className="text-[11px] text-slate-400">
                          le {new Date(tr.date_reception).toLocaleDateString('fr-FR')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal Nouveau Transfert ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 max-w-xl w-full shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <Repeat className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    Nouveau Mouvement Intersite
                  </h3>
                  <p className="text-xs text-slate-400">Enregistrer l'expédition d'un engin ou matériel</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTransfert} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                  Engin / Matériel concerné *
                </label>
                <select
                  required
                  value={form.materiel_id}
                  onChange={e => handleMaterielSelect(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
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
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                    Site d'origine (Départ) *
                  </label>
                  <select
                    required
                    value={form.site_origine_id}
                    onChange={e => setForm(prev => ({ ...prev, site_origine_id: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value="">Sélectionner le départ...</option>
                    {sites.map(s => (
                      <option key={s.id} value={s.id}>{s.nom_site} ({s.ville || 'Bénin'})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                    Site de destination (Arrivée) *
                  </label>
                  <select
                    required
                    value={form.site_destination_id}
                    onChange={e => setForm(prev => ({ ...prev, site_destination_id: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value="">Sélectionner l'arrivée...</option>
                    {sites.map(s => (
                      <option key={s.id} value={s.id}>{s.nom_site} ({s.ville || 'Bénin'})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                    Moyen de transport
                  </label>
                  <select
                    value={form.moyen_transport}
                    onChange={e => setForm(prev => ({ ...prev, moyen_transport: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value="Porte-char interne">Porte-char interne</option>
                    <option value="Porte-char externe (Location)">Porte-char externe</option>
                    <option value="Convoi exceptionnel">Convoi exceptionnel</option>
                    <option value="Autonomie routière">Autonomie routière</option>
                    <option value="Remorquage">Remorquage</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                    Chauffeur / Transporteur
                  </label>
                  <input
                    type="text"
                    placeholder="Nom du chauffeur"
                    value={form.chauffeur_nom}
                    onChange={e => setForm(prev => ({ ...prev, chauffeur_nom: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                    Coût du transport (FCFA)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={form.cout_transport}
                    onChange={e => setForm(prev => ({ ...prev, cout_transport: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5">
                  Motif du déplacement
                </label>
                <input
                  type="text"
                  placeholder="Ex: Démarrage terrassement Lot 2, Révision atelier central..."
                  value={form.motif}
                  onChange={e => setForm(prev => ({ ...prev, motif: e.target.value }))}
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-lg shadow-amber-600/20 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Enregistrement...' : 'Valider le départ du matériel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Confirmation Réception ── */}
      {receptionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Confirmation de Réception
                  </h3>
                  <p className="text-xs text-slate-400">Bon : {receptionModal.numero_transfert}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReceptionModal(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <p>Matériel : <strong>{getMaterielNom(receptionModal.materiel_id)}</strong></p>
              <p>Arrivée sur le site : <strong>{getSiteNom(receptionModal.site_destination_id)}</strong></p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Réceptionné par (Nom du responsable)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Chef de chantier, Responsable parc..."
                  value={receptionForm.receptionne_par}
                  onChange={e => setReceptionForm(prev => ({ ...prev, receptionne_par: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  État du matériel à l'arrivée
                </label>
                <select
                  value={receptionForm.etat_materiel}
                  onChange={e => setReceptionForm(prev => ({ ...prev, etat_materiel: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="BON_ETAT">Bon état de fonctionnement</option>
                  <option value="AVEC_RESERVES">Reçu avec réserves / avaries transport</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Observations de réception
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Heure d'arrivée, niveau gasoil, état des godets..."
                  value={receptionForm.notes_reception}
                  onChange={e => setReceptionForm(prev => ({ ...prev, notes_reception: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setReceptionModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmerReception}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md shadow-emerald-600/20 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Validation...' : 'Valider la réception'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BtpTransfertsPage
