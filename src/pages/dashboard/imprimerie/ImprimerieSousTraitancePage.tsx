// =============================================================================
// GESTIO 229 SaaS — Module Sous-Traitance Imprimerie & Sérigraphie
// Gestion des prestataires externes (DTF, Broderie, Grands Tirages Offset, etc.)
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  GitFork, Plus, RefreshCw, Search, DollarSign, Clock, CheckCircle2,
  AlertTriangle, X, Save, Edit3, Building2, FileText
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { imprimerieService, SousTraitanceOrdre, CommandeImprimerie } from '../../../services/imprimerieService'

export const ImprimerieSousTraitancePage: React.FC = () => {
  const { companyId, sectorSlug } = useTenant()
  const { toast } = useUIStore() as any

  const activeSector = sectorSlug || 'imprimerie'

  const [sousTraitances, setSousTraitances] = useState<SousTraitanceOrdre[]>([])
  const [commandes, setCommandes] = useState<CommandeImprimerie[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingST, setEditingST] = useState<SousTraitanceOrdre | null>(null)

  const [form, setForm] = useState<{
    commande_id: string
    fournisseur_nom: string
    prestation_nom: string
    description: string
    quantite: number
    montant_ht: number
    montant_paye: number
    statut: 'commande' | 'en_cours' | 'recu' | 'paye' | 'annule'
    date_livraison: string
  }>({
    commande_id: '',
    fournisseur_nom: '',
    prestation_nom: 'Impression DTF Externe',
    description: '',
    quantite: 1,
    montant_ht: 15000,
    montant_paye: 0,
    statut: 'commande',
    date_livraison: '',
  })

  const notify = (type: 'success' | 'error', msg: string) => {
    try {
      if (toast?.[type]) toast[type](msg)
      else if (typeof toast === 'function') toast(msg, type)
      else window.alert(msg)
    } catch {
      window.alert(msg)
    }
  }

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [stList, cmdList] = await Promise.all([
        imprimerieService.getSousTraitances(companyId, activeSector),
        imprimerieService.getCommandes(companyId, activeSector),
      ])
      setSousTraitances(stList)
      setCommandes(cmdList)
    } catch (err) {
      console.error('Erreur sous-traitance:', err)
      notify('error', 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }, [companyId, activeSector])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleOpenModal = (st?: SousTraitanceOrdre) => {
    if (st) {
      setEditingST(st)
      setForm({
        commande_id: st.commande_id || '',
        fournisseur_nom: st.fournisseur_nom,
        prestation_nom: st.prestation_nom,
        description: st.description || '',
        quantite: st.quantite,
        montant_ht: st.montant_ht,
        montant_paye: st.montant_paye,
        statut: st.statut,
        date_livraison: st.date_livraison || '',
      })
    } else {
      setEditingST(null)
      setForm({
        commande_id: '',
        fournisseur_nom: '',
        prestation_nom: 'Impression DTF Externe',
        description: '',
        quantite: 1,
        montant_ht: 15000,
        montant_paye: 0,
        statut: 'commande',
        date_livraison: '',
      })
    }
    setShowModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId || !form.fournisseur_nom || !form.prestation_nom) {
      notify('error', 'Veuillez renseigner le prestataire et la prestation.')
      return
    }

    try {
      await imprimerieService.saveSousTraitance({
        id: editingST?.id,
        company_id: companyId,
        sector_slug: activeSector,
        commande_id: form.commande_id || undefined,
        fournisseur_nom: form.fournisseur_nom,
        prestation_nom: form.prestation_nom,
        description: form.description,
        quantite: form.quantite,
        montant_ht: form.montant_ht,
        montant_paye: form.montant_paye,
        statut: form.statut,
        date_livraison: form.date_livraison || undefined,
        date_commande: new Date().toISOString().split('T')[0],
      })
      notify('success', 'Ordre de sous-traitance enregistré avec succès !')
      setShowModal(false)
      loadData()
    } catch (err: any) {
      notify('error', err.message || 'Erreur enregistrement.')
    }
  }

  const filtered = sousTraitances.filter((st) => {
    return (
      st.fournisseur_nom.toLowerCase().includes(search.toLowerCase()) ||
      st.prestation_nom.toLowerCase().includes(search.toLowerCase())
    )
  })

  const totalSousTraitance = sousTraitances.reduce((acc, st) => acc + Number(st.montant_ht || 0), 0)
  const totalRestePayer = sousTraitances.reduce((acc, st) => acc + Number(st.montant_restant || 0), 0)

  return (
    <div className="space-y-6 pb-16 animate-fadeIn">
      {/* ── Entête ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 flex items-center gap-2">
            <GitFork className="w-6 h-6 text-pink-600" /> Ordres de Sous-Traitance
          </h1>
          <p className="text-xs text-slate-500">
            Suivi des ateliers partenaires (DTF, Broderie, Découpe laser, Tirages grand volume) et impact sur le coût de revient
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={loadData} className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-pink-600' : ''}`} />
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2.5 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl text-xs shadow-sm transition"
          >
            <Plus className="w-4 h-4" /> Nouvel Ordre
          </button>
        </div>
      </div>

      {/* ── KPI Rapides ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="font-bold uppercase text-slate-400">Total Ordres Sous-traitance</p>
          <p className="text-xl font-black text-slate-900 mt-1">{sousTraitances.length}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="font-bold uppercase text-slate-400">Montant Total Engagé</p>
          <p className="text-xl font-black text-slate-900 mt-1">{totalSousTraitance.toLocaleString('fr-FR')} F</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="font-bold uppercase text-slate-400">Dette Prestataires (Reste)</p>
          <p className="text-xl font-black text-amber-600 mt-1">{totalRestePayer.toLocaleString('fr-FR')} F</p>
        </div>
      </div>

      {/* ── Recherche ── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par prestataire, prestation..."
          className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-pink-500 focus:outline-none"
        />
      </div>

      {/* ── Table ── */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 text-slate-400 text-xs">
          Aucun ordre de sous-traitance enregistré.
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
              <tr>
                <th className="text-left px-4 py-3">Prestataire</th>
                <th className="text-left px-4 py-3">Prestation / Travail</th>
                <th className="text-left px-4 py-3">Commande Liée</th>
                <th className="text-right px-4 py-3">Quantité</th>
                <th className="text-right px-4 py-3">Montant HT</th>
                <th className="text-right px-4 py-3">Payé</th>
                <th className="text-right px-4 py-3">Reste Dû</th>
                <th className="text-center px-4 py-3">Statut</th>
                <th className="text-center px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((st) => (
                <tr key={st.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 font-bold text-slate-900">{st.fournisseur_nom}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{st.prestation_nom}</td>
                  <td className="px-4 py-3 font-mono text-slate-600">
                    {st.commande_num || 'Travail global'}
                  </td>
                  <td className="px-4 py-3 text-right">{st.quantite}</td>
                  <td className="px-4 py-3 text-right font-black text-slate-900">{Number(st.montant_ht).toLocaleString('fr-FR')} F</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-600">{Number(st.montant_paye).toLocaleString('fr-FR')} F</td>
                  <td className="px-4 py-3 text-right font-black text-amber-600">{Number(st.montant_restant).toLocaleString('fr-FR')} F</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      st.statut === 'paye'
                        ? 'bg-emerald-100 text-emerald-800'
                        : st.statut === 'recu'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {st.statut.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleOpenModal(st)}
                      className="p-1 text-slate-400 hover:text-slate-700"
                      title="Modifier"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── MODAL AJOUT / ÉDITION ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-scaleUp text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-base text-slate-900">
                  {editingST ? 'Modifier Sous-Traitance' : 'Nouvel Ordre de Sous-Traitance'}
                </h3>
                <p className="text-slate-500">Intégration automatique dans le coût de revient</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Fournisseur / Atelier Partenaire *</label>
                <input
                  type="text"
                  required
                  value={form.fournisseur_nom}
                  onChange={(e) => setForm((p) => ({ ...p, fournisseur_nom: e.target.value }))}
                  placeholder="Ex: Atelier DTF Express ou Sérigraphie Pro"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Prestation demandée *</label>
                <input
                  type="text"
                  required
                  value={form.prestation_nom}
                  onChange={(e) => setForm((p) => ({ ...p, prestation_nom: e.target.value }))}
                  placeholder="Ex: Impression Film DTF 10m"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Rattacher à une commande atelier</label>
                <select
                  value={form.commande_id}
                  onChange={(e) => setForm((p) => ({ ...p, commande_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold"
                >
                  <option value="">-- Aucune commande directe (Frais général) --</option>
                  {commandes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.numero_commande} — {c.client_nom} ({c.titre_travail})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Coût Total Sous-traitance (F) *</label>
                  <input
                    type="number"
                    required
                    value={form.montant_ht}
                    onChange={(e) => setForm((p) => ({ ...p, montant_ht: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-black text-slate-900"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Montant Déjà Payé (F)</label>
                  <input
                    type="number"
                    value={form.montant_paye}
                    onChange={(e) => setForm((p) => ({ ...p, montant_paye: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold text-emerald-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Statut d'exécution</label>
                  <select
                    value={form.statut}
                    onChange={(e) => setForm((p) => ({ ...p, statut: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold"
                  >
                    <option value="commande">Commandé</option>
                    <option value="en_cours">En cours de tirage</option>
                    <option value="recu">Reçu à l'atelier</option>
                    <option value="paye">Soldé / Payé</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Date Livraison Prévue</label>
                  <input
                    type="date"
                    value={form.date_livraison}
                    onChange={(e) => setForm((p) => ({ ...p, date_livraison: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-3 py-2 border border-slate-300 rounded-xl font-bold text-slate-600">
                  Annuler
                </button>
                <button type="submit" className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl font-black shadow-xs transition">
                  Enregistrer l'Ordre
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default ImprimerieSousTraitancePage
