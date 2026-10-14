// =============================================================================
// GESTIO 229 SaaS — Organisation Multisite & Ateliers BTP
// Conforme Spécification Section 5.1 & 5.3
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Building2, Plus, Search, Edit3, Trash2, MapPin, Phone,
  User, CheckCircle2, ArrowRightLeft, Layers, X, RefreshCw
} from 'lucide-react'
import { useTenant } from '../../../../hooks/useTenant'
import { useUIStore } from '../../../../store/uiStore'
import { BtpSite, BtpTransfertIntersite, BtpMateriel } from '../../../../services/garageService'
import clsx from 'clsx'

export const BtpSitesPage: React.FC = () => {
  const { companyId, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  const [sites, setSites] = useState<BtpSite[]>([])
  const [transferts, setTransferts] = useState<BtpTransfertIntersite[]>([])
  const [materiels, setMateriels] = useState<BtpMateriel[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'SITES' | 'TRANSFERTS'>('SITES')

  // Modale Nouveau Site
  const [showSiteModal, setShowSiteModal] = useState(false)
  const [editingSite, setEditingSite] = useState<BtpSite | null>(null)
  const [siteForm, setSiteForm] = useState({
    code_site: '',
    nom_site: '',
    type_site: 'CHANTIER',
    ville: 'Cotonou',
    adresse: '',
    responsable_nom: '',
    responsable_tel: '',
    notes: ''
  })

  // Modale Nouveau Transfert
  const [showTransfertModal, setShowTransfertModal] = useState(false)
  const [transfertForm, setTransfertForm] = useState({
    site_origine_id: '',
    site_destination_id: '',
    materiel_id: '',
    moyen_transport: 'Porte-char interne',
    chauffeur_nom: '',
    motif: 'Déploiement pour démarrage de phase chantier'
  })

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [siteRes, trfRes, matRes] = await Promise.all([
        supabaseTenant('btp_sites').select('*').order('code_site'),
        supabaseTenant('btp_transferts_intersites').select('*').order('date_expedition', { ascending: false }).limit(50),
        supabaseTenant('btp_materiels').select('*').order('code_materiel')
      ])

      setSites(siteRes.data || [])
      setTransferts(trfRes.data || [])
      setMateriels(matRes.data || [])
    } catch (err: any) {
      console.warn('[BtpSites] Erreur chargement:', err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSaveSite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!siteForm.code_site.trim() || !siteForm.nom_site.trim()) {
      toast.error('Champs requis', 'Veuillez saisir le code et le nom du site.')
      return
    }

    try {
      const payload: Partial<BtpSite> = {
        company_id: companyId || '',
        ...siteForm,
        code_site: siteForm.code_site.toUpperCase().trim()
      }

      if (editingSite) {
        const { error } = await supabaseTenant('btp_sites').update(payload).eq('id', editingSite.id)
        if (error) throw error
        toast.success('Site mis à jour', `Le site ${siteForm.nom_site} a été actualisé.`)
      } else {
        const { error } = await supabaseTenant('btp_sites').insert([payload])
        if (error) throw error
        toast.success('Site créé', `Le site ${siteForm.nom_site} est désormais répertorié.`)
      }
      setShowSiteModal(false)
      loadData()
    } catch (err: any) {
      toast.error('Erreur site', err.message)
    }
  }

  const handleSaveTransfert = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!transfertForm.site_origine_id || !transfertForm.site_destination_id) {
      toast.error('Sites requis', 'Veuillez sélectionner le site d\'origine et de destination.')
      return
    }

    try {
      const numTrf = `TRF-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
      const payload: Partial<BtpTransfertIntersite> = {
        company_id: companyId || '',
        numero_transfert: numTrf,
        type_transfert: 'MATERIEL',
        site_origine_id: transfertForm.site_origine_id,
        site_destination_id: transfertForm.site_destination_id,
        materiel_id: transfertForm.materiel_id || undefined,
        moyen_transport: transfertForm.moyen_transport,
        chauffeur_nom: transfertForm.chauffeur_nom,
        statut: 'EN_TRANSIT',
        motif: transfertForm.motif
      }

      const { error } = await supabaseTenant('btp_transferts_intersites').insert([payload])
      if (error) throw error

      // Mettre à jour l'emplacement du matériel
      if (transfertForm.materiel_id) {
        const destSite = sites.find(s => s.id === transfertForm.site_destination_id)
        await supabaseTenant('btp_materiels')
          .update({
            site_actuel_id: transfertForm.site_destination_id,
            site_nom: destSite?.nom_site,
            statut: 'EN_TRANSIT'
          })
          .eq('id', transfertForm.materiel_id)
      }

      toast.success('Transfert lancé', `Ordre de transfert ${numTrf} en cours de transit.`)
      setShowTransfertModal(false)
      loadData()
    } catch (err: any) {
      toast.error('Erreur transfert', err.message)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── En-tête ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-amber-600" />
            Organisation Multisite & Ateliers
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Gestion des agences, ateliers centraux, dépôts, bases vie et transferts intersites.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setActiveTab('SITES')}
              className={clsx(
                'px-4 py-2 rounded-xl text-xs font-bold transition',
                activeTab === 'SITES' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              Sites & Ateliers ({sites.length})
            </button>
            <button
              onClick={() => setActiveTab('TRANSFERTS')}
              className={clsx(
                'px-4 py-2 rounded-xl text-xs font-bold transition',
                activeTab === 'TRANSFERTS' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              Transferts Intersites ({transferts.length})
            </button>
          </div>

          <button
            onClick={() => activeTab === 'SITES' ? setShowSiteModal(true) : setShowTransfertModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md shadow-amber-600/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {activeTab === 'SITES' ? 'Nouveau Site' : 'Nouveau Transfert'}
          </button>
        </div>
      </div>

      {/* ── Onglet Sites ── */}
      {activeTab === 'SITES' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {sites.map((s) => (
            <div key={s.id} className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-black text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-md">
                    {s.code_site}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {s.type_site}
                  </span>
                </div>
                <h3 className="text-base font-black text-slate-900 dark:text-white mb-2">{s.nom_site}</h3>

                <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 my-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span>{s.ville} {s.adresse ? `— ${s.adresse}` : ''}</span>
                  </div>
                  {s.responsable_nom && (
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span>{s.responsable_nom} {s.responsable_tel ? `(${s.responsable_tel})` : ''}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setEditingSite(s)
                    setSiteForm({
                      code_site: s.code_site,
                      nom_site: s.nom_site,
                      type_site: s.type_site,
                      ville: s.ville,
                      adresse: s.adresse || '',
                      responsable_nom: s.responsable_nom || '',
                      responsable_tel: s.responsable_tel || '',
                      notes: s.notes || ''
                    })
                    setShowSiteModal(true)
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-amber-600 hover:bg-slate-100 transition"
                >
                  Modifier
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Onglet Transferts ── */}
      {activeTab === 'TRANSFERTS' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          {transferts.length === 0 ? (
            <div className="text-center py-12 p-6 text-xs text-slate-500">
              Aucun transfert de matériel intersites enregistré.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold uppercase border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">N° Transfert</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Origine ➔ Destination</th>
                    <th className="py-3 px-4">Matériel / Engin</th>
                    <th className="py-3 px-4">Moyen de Transport</th>
                    <th className="py-3 px-4">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {transferts.map(t => {
                    const orig = sites.find(s => s.id === t.site_origine_id)
                    const dest = sites.find(s => s.id === t.site_destination_id)
                    const mat = materiels.find(m => m.id === t.materiel_id)

                    return (
                      <tr key={t.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                          {t.numero_transfert}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {new Date(t.date_expedition).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">
                          {orig?.nom_site || 'Origine'} ➔ <span className="text-amber-600">{dest?.nom_site || 'Destination'}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-900 dark:text-white">{mat?.code_materiel || 'Engin'}</span>
                          {mat && <div className="text-[10px] text-slate-500">{mat.designation}</div>}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {t.moyen_transport} {t.chauffeur_nom ? `(${t.chauffeur_nom})` : ''}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            {t.statut}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Modale Formulaire Site ── */}
      {showSiteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <h3 className="font-black text-base text-slate-900 dark:text-white">
                {editingSite ? 'Modifier Site' : 'Ajouter un Site BTP'}
              </h3>
              <button onClick={() => setShowSiteModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSite} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Code Site *
                </label>
                <input
                  type="text"
                  required
                  value={siteForm.code_site}
                  onChange={(e) => setSiteForm({ ...siteForm, code_site: e.target.value })}
                  placeholder="Ex: CHT-RNIE1, ATEL-CENTRAL"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Nom du Site *
                </label>
                <input
                  type="text"
                  required
                  value={siteForm.nom_site}
                  onChange={(e) => setSiteForm({ ...siteForm, nom_site: e.target.value })}
                  placeholder="Ex: Chantier RNIE1 Bohicon-Dassa"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Type de Site
                  </label>
                  <select
                    value={siteForm.type_site}
                    onChange={(e) => setSiteForm({ ...siteForm, type_site: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="CHANTIER">Chantier BTP</option>
                    <option value="ATELIER_CENTRAL">Atelier Central</option>
                    <option value="ATELIER_SECONDAIRE">Atelier Chantier</option>
                    <option value="DEPOT">Dépôt Régional</option>
                    <option value="BASE_VIE">Base Vie</option>
                    <option value="SIEGE">Siège / Direction</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Ville
                  </label>
                  <input
                    type="text"
                    value={siteForm.ville}
                    onChange={(e) => setSiteForm({ ...siteForm, ville: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Nom du Responsable
                </label>
                <input
                  type="text"
                  value={siteForm.responsable_nom}
                  onChange={(e) => setSiteForm({ ...siteForm, responsable_nom: e.target.value })}
                  placeholder="Chef de site / Chef de chantier"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSiteModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modale Formulaire Transfert ── */}
      {showTransfertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <h3 className="font-black text-base text-slate-900 dark:text-white">Ordonner un Transfert Intersites</h3>
              <button onClick={() => setShowTransfertModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTransfert} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Matériel / Engin à Déplacer
                </label>
                <select
                  value={transfertForm.materiel_id}
                  onChange={(e) => setTransfertForm({ ...transfertForm, materiel_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="">-- Sélectionner l'engin --</option>
                  {materiels.map(m => (
                    <option key={m.id} value={m.id}>{m.code_materiel} — {m.designation}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Site d'Origine *
                  </label>
                  <select
                    required
                    value={transfertForm.site_origine_id}
                    onChange={(e) => setTransfertForm({ ...transfertForm, site_origine_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="">-- Choisir --</option>
                    {sites.map(s => (
                      <option key={s.id} value={s.id}>{s.nom_site}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Site Destination *
                  </label>
                  <select
                    required
                    value={transfertForm.site_destination_id}
                    onChange={(e) => setTransfertForm({ ...transfertForm, site_destination_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="">-- Choisir --</option>
                    {sites.map(s => (
                      <option key={s.id} value={s.id}>{s.nom_site}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Moyen de Transport
                </label>
                <input
                  type="text"
                  value={transfertForm.moyen_transport}
                  onChange={(e) => setTransfertForm({ ...transfertForm, moyen_transport: e.target.value })}
                  placeholder="Ex: Porte-char interne, Convoi exceptionnel..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTransfertModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md"
                >
                  Valider le Transfert
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default BtpSitesPage
