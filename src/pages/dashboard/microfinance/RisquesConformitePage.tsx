import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useTenant } from '../../../hooks/useTenant'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import {
  ShieldAlert,
  Plus,
  RefreshCw,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Printer,
  X,
  FileCheck2,
  UserCheck,
  Scale,
  Eye,
  FileText
} from 'lucide-react'

interface ConformiteAlerte {
  id: string
  reference: string
  type_alerte:
    | 'DEPASSEMENT_SEUIL_ESPECES'
    | 'OPERATION_INHABITUELLE'
    | 'PIECE_EXPIREE'
    | 'RETARD_CRITIQUE_PAR'
    | 'REVERSEMENT_TARDIF'
    | 'SOUPCON_BLANCHIMENT'
  gravite: 'FAIBLE' | 'MOYENNE' | 'CRITIQUE'
  entite_type: 'MEMBRE' | 'AGENT' | 'CREDIT' | 'TRANSACTION'
  entite_id?: string
  entite_nom: string
  description: string
  montant_concerne: number
  statut: 'OUVERTE' | 'EN_COURS' | 'RESOLUE' | 'CLASSEE'
  traite_par?: string
  date_alerte: string
  created_at: string
}

export const RisquesConformitePage: React.FC = () => {
  const { companyId, sectorSlug, supabaseTenant } = useTenant()
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [alertes, setAlertes] = useState<ConformiteAlerte[]>([])
  const [membres, setMembres] = useState<any[]>([])
  const [selectedAlerte, setSelectedAlerte] = useState<ConformiteAlerte | null>(null)

  // Filtres
  const [searchTerm, setSearchTerm] = useState('')
  const [filterGravite, setFilterGravite] = useState<string>('ALL')
  const [filterStatut, setFilterStatut] = useState<string>('ALL')

  // Modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [showProcessModal, setShowProcessModal] = useState(false)

  // Formulaire Nouvelle Déclaration
  const [newAlerte, setNewAlerte] = useState({
    type_alerte: 'OPERATION_INHABITUELLE' as ConformiteAlerte['type_alerte'],
    gravite: 'MOYENNE' as ConformiteAlerte['gravite'],
    entite_type: 'MEMBRE' as ConformiteAlerte['entite_type'],
    entite_nom: '',
    montant_concerne: '0',
    description: ''
  })

  // Formulaire Traitement Alerte
  const [processForm, setProcessForm] = useState({
    statut: 'RESOLUE' as ConformiteAlerte['statut'],
    observations: ''
  })

  // 1. Chargement
  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [altRes, memRes] = await Promise.all([
        supabaseTenant('microfinance_conformite_alertes')
          .select('*')
          .order('date_alerte', { ascending: false }),
        supabaseTenant('microfinance_membres')
          .select('id, nom_complet, telephone, piece_expire_le, kyc_niveau_risque')
          .eq('statut', 'ACTIF')
      ])

      if (altRes.error) throw altRes.error
      if (memRes.error) throw memRes.error

      setAlertes(altRes.data || [])
      setMembres(memRes.data || [])

      // Détection automatique des pièces expirées non encore alertées
      const now = new Date()
      const membresExpires = (memRes.data || []).filter((m: any) => {
        if (!m.piece_expire_le) return false
        return new Date(m.piece_expire_le) < now
      })

      // Création automatique d'alertes pièces expirées si pas encore créées
      for (const m of membresExpires) {
        const exist = (altRes.data || []).some(
          (a: ConformiteAlerte) => a.entite_id === m.id && a.type_alerte === 'PIECE_EXPIREE' && a.statut !== 'RESOLUE'
        )
        if (!exist) {
          await supabaseTenant('microfinance_conformite_alertes').insert({
            company_id: companyId,
            sector_slug: sectorSlug || 'microfinance',
            reference: `ALT-${Date.now().toString().slice(-6)}`,
            type_alerte: 'PIECE_EXPIREE',
            gravite: 'MOYENNE',
            entite_type: 'MEMBRE',
            entite_id: m.id,
            entite_nom: m.nom_complet,
            description: `La pièce d'identité de l'adhérent a expiré le ${new Date(m.piece_expire_le).toLocaleDateString('fr-FR')}. Mise à jour KYC requise (Loi 2025-14).`,
            montant_concerne: 0,
            statut: 'OUVERTE',
            date_alerte: new Date().toISOString()
          })
        }
      }
    } catch (err: any) {
      console.error('Erreur conformité:', err)
      toast.error('Erreur lors du chargement des alertes de conformité')
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant, toast])

  useEffect(() => {
    loadData()
  }, [companyId])

  // 2. Stats Risques & Conformité
  const stats = useMemo(() => {
    let ouvertes = 0
    let critiques = 0
    let resolues = 0

    alertes.forEach(a => {
      if (a.statut === 'OUVERTE' || a.statut === 'EN_COURS') ouvertes++
      if (a.gravite === 'CRITIQUE' && a.statut !== 'RESOLUE') critiques++
      if (a.statut === 'RESOLUE') resolues++
    })

    return {
      ouvertes,
      critiques,
      resolues,
      total: alertes.length
    }
  }, [alertes])

  // Filtrage
  const filteredAlertes = useMemo(() => {
    return alertes.filter(a => {
      const matchSearch =
        a.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.entite_nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.description.toLowerCase().includes(searchTerm.toLowerCase())
      const matchGravite = filterGravite === 'ALL' || a.gravite === filterGravite
      const matchStatut = filterStatut === 'ALL' || a.statut === filterStatut
      return matchSearch && matchGravite && matchStatut
    })
  }, [alertes, searchTerm, filterGravite, filterStatut])

  // 3. Création Déclaration Conformité
  const handleCreateAlerte = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAlerte.entite_nom || !newAlerte.description) {
      toast.error('Veuillez renseigner les champs requis')
      return
    }

    try {
      const ref = `ALT-${Date.now().toString().slice(-6)}`
      const { error } = await supabaseTenant('microfinance_conformite_alertes').insert({
        company_id: companyId,
        sector_slug: sectorSlug || 'microfinance',
        reference: ref,
        type_alerte: newAlerte.type_alerte,
        gravite: newAlerte.gravite,
        entite_type: newAlerte.entite_type,
        entite_nom: newAlerte.entite_nom,
        description: newAlerte.description,
        montant_concerne: Number(newAlerte.montant_concerne) || 0,
        statut: 'OUVERTE',
        date_alerte: new Date().toISOString()
      })

      if (error) throw error

      toast.success('Déclaration de conformité enregistrée !')
      setShowAddModal(false)
      setNewAlerte({
        type_alerte: 'OPERATION_INHABITUELLE',
        gravite: 'MOYENNE',
        entite_type: 'MEMBRE',
        entite_nom: '',
        montant_concerne: '0',
        description: ''
      })
      await loadData()
    } catch (err: any) {
      console.error('Erreur création alerte:', err)
      toast.error('Erreur lors de l\'enregistrement')
    }
  }

  // 4. Traitement Alerte
  const handleProcessAlerte = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAlerte) return

    try {
      const { error } = await supabaseTenant('microfinance_conformite_alertes')
        .update({
          statut: processForm.statut,
          traite_par: user?.name || 'Responsable Conformité',
          description: `${selectedAlerte.description} [RÉSOLUTION: ${processForm.observations}]`
        })
        .eq('id', selectedAlerte.id)

      if (error) throw error

      toast.success('Dossier de conformité mis à jour !')
      setShowProcessModal(false)
      setSelectedAlerte(null)
      await loadData()
    } catch (err: any) {
      console.error('Erreur traitement alerte:', err)
      toast.error('Erreur lors du traitement')
    }
  }

  return (
    <div className="space-y-6 animate-fadeIn p-2 md:p-6 pb-20">
      {/* 1. EN-TÊTE */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Risques, Conformité & Dispositif LBC/FT/FP
              </h1>
              <p className="text-xs font-semibold text-slate-500">
                Lutte anti-blanchiment, seuils d'espèces, KYC & réglementation loi n°2025-14 (Bénin / UEMOA)
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
            className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black shadow-lg shadow-rose-200 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Déclaration Soupçon / Alerte</span>
          </button>
        </div>
      </div>

      {/* 2. STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Alertes Actives</span>
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{stats.ouvertes}</div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">Dossiers en attente d'instruction</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Risque Critique</span>
            <AlertTriangle className="w-5 h-5 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-600">{stats.critiques}</div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">Nécessite signalement CENTIF / ANLBC</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Dossiers Régularisés</span>
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-600">{stats.resolues}</div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">Alertes clôturées après contrôle</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Norme Réglementaire</span>
            <Scale className="w-5 h-5 text-indigo-500" />
          </div>
          <div className="text-xs font-black text-slate-900 mt-1">Loi n°2025-14 Bénin</div>
          <p className="text-[11px] font-medium text-slate-400 mt-1">Directives BCEAO / UEMOA actives</p>
        </div>
      </div>

      {/* 3. LISTE DES ALERTES */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Barre d'outils et recherche */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
            <h3 className="text-sm font-black text-slate-900">Registre des Vigilances & Déclarations</h3>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Réf, Entité, Motif..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
              />
            </div>

            <select
              value={filterGravite}
              onChange={e => setFilterGravite(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
            >
              <option value="ALL">Toute gravité</option>
              <option value="CRITIQUE">Critique</option>
              <option value="MOYENNE">Moyenne</option>
              <option value="FAIBLE">Faible</option>
            </select>

            <select
              value={filterStatut}
              onChange={e => setFilterStatut(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
            >
              <option value="ALL">Tous statuts</option>
              <option value="OUVERTE">Ouverte</option>
              <option value="EN_COURS">En cours</option>
              <option value="RESOLUE">Résolue</option>
            </select>
          </div>
        </div>

        {/* Tableau */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px]">
              <tr>
                <th className="py-3 px-4">Réf</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Type de Risque</th>
                <th className="py-3 px-4">Entité Concernée</th>
                <th className="py-3 px-4 text-right">Montant</th>
                <th className="py-3 px-4 text-center">Gravité</th>
                <th className="py-3 px-4 text-center">Statut</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin text-rose-600 mx-auto mb-2" />
                    Chargement des alertes...
                  </td>
                </tr>
              ) : filteredAlertes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Aucune alerte de conformité enregistrée.
                  </td>
                </tr>
              ) : (
                filteredAlertes.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-700">{a.reference}</td>
                    <td className="py-3 px-4 text-slate-500">
                      {new Date(a.date_alerte).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-900 block">{a.type_alerte.replace(/_/g, ' ')}</span>
                      <span className="text-[11px] text-slate-400 line-clamp-1">{a.description}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-800">{a.entite_nom}</span>
                      <span className="text-[10px] text-slate-400 block uppercase font-mono">{a.entite_type}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-black text-slate-900">
                      {a.montant_concerne > 0 ? `${a.montant_concerne.toLocaleString('fr-FR')} F` : '-'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                          a.gravite === 'CRITIQUE'
                            ? 'bg-rose-100 text-rose-700'
                            : a.gravite === 'MOYENNE'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {a.gravite}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                          a.statut === 'RESOLUE'
                            ? 'bg-emerald-100 text-emerald-700'
                            : a.statut === 'EN_COURS'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {a.statut}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => {
                          setSelectedAlerte(a)
                          setShowProcessModal(true)
                        }}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-[11px] transition-all"
                      >
                        Traiter
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1 : DÉCLARATION ALERTE */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-scaleUp text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900">Nouvelle Alerte / Déclaration Soupçon</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAlerte} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Type de Vigilance</label>
                <select
                  value={newAlerte.type_alerte}
                  onChange={e => setNewAlerte({ ...newAlerte, type_alerte: e.target.value as any })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  <option value="DEPASSEMENT_SEUIL_ESPECES">Dépassement Seuil Espèces (&gt; 5M FCFA)</option>
                  <option value="OPERATION_INHABITUELLE">Opération Inhabituelle / Fractionnée</option>
                  <option value="PIECE_EXPIREE">Pièce d'Identité Expirée (KYC)</option>
                  <option value="SOUPCON_BLANCHIMENT">Soupçon de Blanchiment (CENTIF)</option>
                  <option value="REVERSEMENT_TARDIF">Reversement Tardif d'un Collecteur</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Gravité</label>
                  <select
                    value={newAlerte.gravite}
                    onChange={e => setNewAlerte({ ...newAlerte, gravite: e.target.value as any })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  >
                    <option value="FAIBLE">Faible</option>
                    <option value="MOYENNE">Moyenne</option>
                    <option value="CRITIQUE">Critique</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Montant en Jeu (FCFA)</label>
                  <input
                    type="number"
                    value={newAlerte.montant_concerne}
                    onChange={e => setNewAlerte({ ...newAlerte, montant_concerne: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Entité / Personne Concernée *</label>
                <input
                  type="text"
                  required
                  placeholder="Nom de l'adhérent, agent ou tiers..."
                  value={newAlerte.entite_nom}
                  onChange={e => setNewAlerte({ ...newAlerte, entite_nom: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Motif et Constatations *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Circonstances détaillées de l'alerte ou de l'incohérence observée..."
                  value={newAlerte.description}
                  onChange={e => setNewAlerte({ ...newAlerte, description: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none"
                />
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
                  className="px-5 py-2 rounded-xl font-black bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-200"
                >
                  Consigner l'Alerte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2 : TRAITEMENT ALERTE */}
      {showProcessModal && selectedAlerte && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-scaleUp text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Instruction & Clôture du Dossier</h3>
                <p className="text-xs text-slate-500">{selectedAlerte.reference}</p>
              </div>
              <button
                onClick={() => setShowProcessModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleProcessAlerte} className="space-y-3">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Motif Initial</span>
                <p className="font-semibold text-slate-800 mt-1">{selectedAlerte.description}</p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Statut Final</label>
                <select
                  value={processForm.statut}
                  onChange={e => setProcessForm({ ...processForm, statut: e.target.value as any })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                >
                  <option value="EN_COURS">En cours d'instruction</option>
                  <option value="RESOLUE">Régularisé / Résolu</option>
                  <option value="CLASSEE">Classé sans suite</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Conclusions & Mesures Prises</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Justificatifs vérifiés, pièce renouvelée, déclaration transmise..."
                  value={processForm.observations}
                  onChange={e => setProcessForm({ ...processForm, observations: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowProcessModal(false)}
                  className="px-4 py-2 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-600"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200"
                >
                  Enregistrer Résolution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default RisquesConformitePage
