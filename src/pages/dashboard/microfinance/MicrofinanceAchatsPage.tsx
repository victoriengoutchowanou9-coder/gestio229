import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useTenant } from '../../../hooks/useTenant'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import {
  Building2,
  Plus,
  RefreshCw,
  Search,
  Filter,
  DollarSign,
  Calendar,
  FileText,
  CheckCircle2,
  Clock,
  Printer,
  X,
  CreditCard
} from 'lucide-react'

interface AchatExploitation {
  id: string
  reference: string
  fournisseur_nom: string
  fournisseur_tel?: string
  categorie:
    | 'Fournitures_Bureau'
    | 'Loyer_Agence'
    | 'Informatique_Logiciel'
    | 'Carburant_Deplacements'
    | 'Maintenance_Locaux'
    | 'Honoraires_Prestations'
    | 'Communication_Marketing'
    | 'Autre'
  description: string
  montant_ttc: number
  mode_reglement: 'ESPECES' | 'VIREMENT_BANCAIRE' | 'CHEQUE' | 'MOBILE_MONEY'
  date_depense: string
  statut_paiement: 'PAYE' | 'A_PAYER' | 'PARTIEL'
  engage_par: string
  valide_par?: string
  created_at: string
}

export const MicrofinanceAchatsPage: React.FC = () => {
  const { companyId, sectorSlug, supabaseTenant } = useTenant()
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [achats, setAchats] = useState<AchatExploitation[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategorie, setFilterCategorie] = useState<string>('ALL')

  // Modals
  const [showAddModal, setShowAddModal] = useState(false)

  // Formulaire Nouvel Achat
  const [newAchat, setNewAchat] = useState({
    fournisseur_nom: '',
    fournisseur_tel: '',
    categorie: 'Fournitures_Bureau' as AchatExploitation['categorie'],
    description: '',
    montant_ttc: '',
    mode_reglement: 'ESPECES' as AchatExploitation['mode_reglement'],
    date_depense: new Date().toISOString().slice(0, 10),
    statut_paiement: 'PAYE' as AchatExploitation['statut_paiement'],
    engage_par: user?.name || 'Comptable IMF'
  })

  // 1. Chargement
  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const { data, error } = await supabaseTenant('microfinance_achats_exploitation')
        .select('*')
        .order('date_depense', { ascending: false })

      if (error) throw error
      setAchats(data || [])
    } catch (err: any) {
      console.error('Erreur chargement achats:', err)
      toast.error('Erreur lors du chargement des dépenses d\'exploitation')
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant, toast])

  useEffect(() => {
    loadData()
  }, [companyId])

  // 2. Stats
  const stats = useMemo(() => {
    let totalDepenses = 0
    let depensesMois = 0
    let aPayer = 0

    const currentMonth = new Date().toISOString().slice(0, 7)

    achats.forEach(a => {
      const montant = Number(a.montant_ttc || 0)
      totalDepenses += montant
      if (a.date_depense && a.date_depense.startsWith(currentMonth)) {
        depensesMois += montant
      }
      if (a.statut_paiement === 'A_PAYER') {
        aPayer += montant
      }
    })

    return {
      totalDepenses,
      depensesMois,
      aPayer,
      nbFactures: achats.length
    }
  }, [achats])

  // Filtrage
  const filteredAchats = useMemo(() => {
    return achats.filter(a => {
      const matchSearch =
        a.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.fournisseur_nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.description.toLowerCase().includes(searchTerm.toLowerCase())
      const matchCat = filterCategorie === 'ALL' || a.categorie === filterCategorie
      return matchSearch && matchCat
    })
  }, [achats, searchTerm, filterCategorie])

  // 3. Création
  const handleCreateAchat = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAchat.fournisseur_nom || !newAchat.montant_ttc || !newAchat.description) {
      toast.error('Veuillez renseigner les champs obligatoires')
      return
    }

    try {
      const ref = `ACH-${Date.now().toString().slice(-6)}`
      const { error } = await supabaseTenant('microfinance_achats_exploitation').insert({
        company_id: companyId,
        sector_slug: sectorSlug || 'microfinance',
        reference: ref,
        fournisseur_nom: newAchat.fournisseur_nom,
        fournisseur_tel: newAchat.fournisseur_tel,
        categorie: newAchat.categorie,
        description: newAchat.description,
        montant_ttc: Number(newAchat.montant_ttc),
        mode_reglement: newAchat.mode_reglement,
        date_depense: newAchat.date_depense,
        statut_paiement: newAchat.statut_paiement,
        engage_par: newAchat.engage_par,
        valide_par: user?.name || 'Directeur Financier'
      })

      if (error) throw error

      toast.success('Dépense d\'exploitation enregistrée !')
      setShowAddModal(false)
      setNewAchat({
        fournisseur_nom: '',
        fournisseur_tel: '',
        categorie: 'Fournitures_Bureau',
        description: '',
        montant_ttc: '',
        mode_reglement: 'ESPECES',
        date_depense: new Date().toISOString().slice(0, 10),
        statut_paiement: 'PAYE',
        engage_par: user?.name || 'Comptable IMF'
      })
      await loadData()
    } catch (err: any) {
      console.error('Erreur création achat:', err)
      toast.error('Erreur lors de l\'enregistrement')
    }
  }

  return (
    <div className="space-y-6 animate-fadeIn p-2 md:p-6 pb-20">
      {/* 1. EN-TÊTE */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Charges & Dépenses d'Exploitation de l'IMF
              </h1>
              <p className="text-xs font-semibold text-slate-500">
                Fournitures, loyers agences, parc informatique, carburant des collecteurs & prestataires
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-all flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualiser</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-5 py-3 bg-slate-900 hover:bg-black text-white rounded-2xl text-xs font-black shadow-lg shadow-slate-200 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Engager une Dépense</span>
          </button>
        </div>
      </div>

      {/* 2. STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Charges du Mois</span>
            <Calendar className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {stats.depensesMois.toLocaleString('fr-FR')} <span className="text-xs font-semibold">FCFA</span>
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">Dépenses engagées ce mois-ci</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Factures en Attente</span>
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600">
            {stats.aPayer.toLocaleString('fr-FR')} <span className="text-xs font-semibold">FCFA</span>
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">Dettes fournisseurs d'exploitation</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Cumul Annuel</span>
            <DollarSign className="w-5 h-5 text-slate-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {stats.totalDepenses.toLocaleString('fr-FR')} <span className="text-xs font-semibold">FCFA</span>
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">Total des charges institutionnelles</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Justificatifs</span>
            <FileText className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-600">{stats.nbFactures}</div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">Pièces comptables enregistrées</p>
        </div>
      </div>

      {/* 3. TABLEAU DES DÉPENSES */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-slate-700" />
            <h3 className="text-sm font-black text-slate-900">Journal des Achats & Factures Fournisseurs</h3>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Fournisseur, motif, réf..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
              />
            </div>

            <select
              value={filterCategorie}
              onChange={e => setFilterCategorie(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
            >
              <option value="ALL">Toutes catégories</option>
              <option value="Fournitures_Bureau">Fournitures Bureau</option>
              <option value="Loyer_Agence">Loyer Agence</option>
              <option value="Informatique_Logiciel">Informatique & Logiciel</option>
              <option value="Carburant_Deplacements">Carburant & Déplacements</option>
              <option value="Maintenance_Locaux">Maintenance Locaux</option>
              <option value="Honoraires_Prestations">Honoraires & Prestations</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px]">
              <tr>
                <th className="py-3 px-4">Réf</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Fournisseur</th>
                <th className="py-3 px-4">Catégorie</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4 text-right">Montant TTC</th>
                <th className="py-3 px-4 text-center">Règlement</th>
                <th className="py-3 px-4 text-center">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin text-slate-600 mx-auto mb-2" />
                    Chargement des dépenses...
                  </td>
                </tr>
              ) : filteredAchats.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Aucune dépense d'exploitation enregistrée.
                  </td>
                </tr>
              ) : (
                filteredAchats.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-700">{a.reference}</td>
                    <td className="py-3 px-4 text-slate-500">
                      {new Date(a.date_depense).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">{a.fournisseur_nom}</td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-full">
                        {a.categorie.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{a.description}</td>
                    <td className="py-3 px-4 text-right font-black text-slate-900">
                      {a.montant_ttc.toLocaleString('fr-FR')} F
                    </td>
                    <td className="py-3 px-4 text-center text-[10px] text-slate-500 font-bold">
                      {a.mode_reglement}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                          a.statut_paiement === 'PAYE'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {a.statut_paiement}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL AJOUT DÉPENSE */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-scaleUp text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900">Engager une Dépense d'Exploitation</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAchat} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Fournisseur / Prestataire *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Librairie SONACOP, SBEE, MTN..."
                  value={newAchat.fournisseur_nom}
                  onChange={e => setNewAchat({ ...newAchat, fournisseur_nom: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Catégorie de Charge</label>
                  <select
                    value={newAchat.categorie}
                    onChange={e => setNewAchat({ ...newAchat, categorie: e.target.value as any })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  >
                    <option value="Fournitures_Bureau">Fournitures Bureau</option>
                    <option value="Loyer_Agence">Loyer Agence</option>
                    <option value="Informatique_Logiciel">Informatique & Logiciel</option>
                    <option value="Carburant_Deplacements">Carburant & Déplacements</option>
                    <option value="Maintenance_Locaux">Maintenance Locaux</option>
                    <option value="Honoraires_Prestations">Honoraires & Prestations</option>
                    <option value="Communication_Marketing">Communication</option>
                    <option value="Autre">Autre</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Montant TTC (FCFA) *</label>
                  <input
                    type="number"
                    required
                    min="100"
                    placeholder="Ex: 45000"
                    value={newAchat.montant_ttc}
                    onChange={e => setNewAchat({ ...newAchat, montant_ttc: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Motif / Description *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Rames de papier, encre imprimante reçus guichet..."
                  value={newAchat.description}
                  onChange={e => setNewAchat({ ...newAchat, description: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mode de Règlement</label>
                  <select
                    value={newAchat.mode_reglement}
                    onChange={e => setNewAchat({ ...newAchat, mode_reglement: e.target.value as any })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  >
                    <option value="ESPECES">Espèces (Petite Caisse)</option>
                    <option value="VIREMENT_BANCAIRE">Virement Bancaire</option>
                    <option value="CHEQUE">Chèque</option>
                    <option value="MOBILE_MONEY">Mobile Money</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Statut Paiement</label>
                  <select
                    value={newAchat.statut_paiement}
                    onChange={e => setNewAchat({ ...newAchat, statut_paiement: e.target.value as any })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  >
                    <option value="PAYE">Payé Immédiatement</option>
                    <option value="A_PAYER">À Payer (Facture reçue)</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-black bg-slate-900 hover:bg-black text-white shadow-md shadow-slate-200"
                >
                  Enregistrer la Dépense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default MicrofinanceAchatsPage
