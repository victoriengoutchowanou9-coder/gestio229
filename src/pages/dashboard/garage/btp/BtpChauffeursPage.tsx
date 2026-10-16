import React, { useState, useEffect } from 'react'
import {
  UserCheck,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  Award,
  Phone,
  Building,
  CheckCircle,
  Clock,
  Truck,
  Edit2,
  Trash2,
  Calendar,
  X,
  FileCheck
} from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { useTenant } from '../../../../hooks/useTenant'
import type { BtpChauffeurOperateur, BtpSite, BtpMateriel } from '../../../../services/garageService'
import { showModal, showConfirm } from '../../../../components/modals/CustomModalGestio'

const CACES_PRESETS = [
  'R482 Catégorie A (Mini-pelle, compacteur)',
  'R482 Catégorie B1 (Pelle hydraulique > 6t)',
  'R482 Catégorie C1 (Chargeuse sur pneus)',
  'R482 Catégorie D (Tombereau articulé / rigide)',
  'R482 Catégorie E (Bouteur, Bull)',
  'R482 Catégorie F (Chariot tout-terrain, télescopique)',
  'R482 Catégorie G (Conduite hors production / porte-char)',
  'R486 (Nacelle PEMP)',
  'R489 Catégorie 3 (Chariot élévateur frontal)'
]

export default function BtpChauffeursPage() {
  const { companyId } = useTenant()

  const [chauffeurs, setChauffeurs] = useState<BtpChauffeurOperateur[]>([])
  const [sites, setSites] = useState<BtpSite[]>([])
  const [materiels, setMateriels] = useState<BtpMateriel[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statutFilter, setStatutFilter] = useState('TOUS')

  // Modale
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingChauffeur, setEditingChauffeur] = useState<BtpChauffeurOperateur | null>(null)
  const [formData, setFormData] = useState<Partial<BtpChauffeurOperateur>>({
    matricule: '',
    nom_complet: '',
    telephone: '',
    site_rattachement_id: '',
    categories_permis: ['B', 'C'],
    habilitations_caces: [],
    date_expiration_permis: '',
    date_expiration_visite_medicale: '',
    statut: 'DISPONIBLE',
    materiel_actuel_id: '',
    notes: ''
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (companyId) {
      loadData()
    }
  }, [companyId])

  const loadData = async () => {
    try {
      setLoading(true)
      const [resChauf, resSites, resMat] = await Promise.all([
        supabase
          .from('btp_chauffeurs_operateurs')
          .select('*')
          .eq('company_id', companyId)
          .order('nom_complet', { ascending: true }),
        supabase
          .from('btp_sites')
          .select('*')
          .eq('company_id', companyId)
          .order('nom_site', { ascending: true }),
        supabase
          .from('btp_materiels')
          .select('*')
          .eq('company_id', companyId)
          .order('code_materiel', { ascending: true })
      ])

      if (resChauf.data) setChauffeurs(resChauf.data)
      if (resSites.data) setSites(resSites.data)
      if (resMat.data) setMateriels(resMat.data)
    } catch (err) {
      console.error('Erreur chargement chauffeurs BTP:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (chauf?: BtpChauffeurOperateur) => {
    if (chauf) {
      setEditingChauffeur(chauf)
      setFormData({
        ...chauf,
        categories_permis: chauf.categories_permis || [],
        habilitations_caces: chauf.habilitations_caces || []
      })
    } else {
      setEditingChauffeur(null)
      const count = chauffeurs.length + 1
      setFormData({
        matricule: `CHF-${String(count).padStart(3, '0')}`,
        nom_complet: '',
        telephone: '',
        site_rattachement_id: sites[0]?.id || '',
        categories_permis: ['B', 'C'],
        habilitations_caces: [],
        date_expiration_permis: '',
        date_expiration_visite_medicale: '',
        statut: 'DISPONIBLE',
        materiel_actuel_id: '',
        notes: ''
      })
    }
    setIsModalOpen(true)
  }

  const handleToggleCaces = (caces: string) => {
    const current = formData.habilitations_caces || []
    if (current.includes(caces)) {
      setFormData({ ...formData, habilitations_caces: current.filter(c => c !== caces) })
    } else {
      setFormData({ ...formData, habilitations_caces: [...current, caces] })
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId || !formData.nom_complet || !formData.matricule) return

    try {
      setSaving(true)
      const payload = {
        company_id: companyId,
        matricule: formData.matricule,
        nom_complet: formData.nom_complet,
        telephone: formData.telephone || null,
        site_rattachement_id: formData.site_rattachement_id || null,
        categories_permis: formData.categories_permis || [],
        habilitations_caces: formData.habilitations_caces || [],
        date_expiration_permis: formData.date_expiration_permis || null,
        date_expiration_visite_medicale: formData.date_expiration_visite_medicale || null,
        statut: formData.statut || 'DISPONIBLE',
        materiel_actuel_id: formData.materiel_actuel_id || null,
        notes: formData.notes || null
      }

      if (editingChauffeur) {
        const { error } = await supabase
          .from('btp_chauffeurs_operateurs')
          .update(payload)
          .eq('id', editingChauffeur.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('btp_chauffeurs_operateurs')
          .insert(payload)
        if (error) throw error
      }

      setIsModalOpen(false)
      loadData()
    } catch (err: any) {
      showModal({
        type: 'error',
        title: 'Erreur d\'enregistrement',
        message: err.message || 'Erreur lors de l\'enregistrement du conducteur.',
        domaine: 'www.gestio229.com'
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    const ok = await showConfirm('Supprimer ce conducteur / opérateur ?', 'Confirmation suppression')
    if (!ok) return
    try {
      const { error } = await supabase
        .from('btp_chauffeurs_operateurs')
        .delete()
        .eq('id', id)
      if (error) throw error
      loadData()
    } catch (err: any) {
      showModal({
        type: 'error',
        title: 'Erreur',
        message: err.message || 'Impossible de supprimer ce conducteur.',
        domaine: 'www.gestio229.com'
      })
    }
  }

  // Filtrage
  const filteredChauffeurs = chauffeurs.filter(ch => {
    const matchSearch =
      ch.nom_complet.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ch.matricule.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ch.telephone && ch.telephone.includes(searchTerm)) ||
      ch.habilitations_caces?.some(c => c.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchStatut = statutFilter === 'TOUS' || ch.statut === statutFilter
    return matchSearch && matchStatut
  })

  // Alertes dates
  const isExpiringSoon = (dateStr?: string) => {
    if (!dateStr) return false
    const d = new Date(dateStr)
    const diffDays = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return diffDays <= 30 && diffDays >= 0
  }

  const isExpired = (dateStr?: string) => {
    if (!dateStr) return false
    return new Date(dateStr).getTime() < Date.now()
  }

  const alertesMedicales = chauffeurs.filter(c => isExpired(c.date_expiration_visite_medicale) || isExpiringSoon(c.date_expiration_visite_medicale))
  const alertesPermis = chauffeurs.filter(c => isExpired(c.date_expiration_permis) || isExpiringSoon(c.date_expiration_permis))

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 mb-2">
            <UserCheck className="w-3.5 h-3.5" />
            Parc Matériel BTP & Génie Civil
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            Chauffeurs, Conducteurs d'Engins & CACES
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Gestion des permis, habilitations CACES R482, visites médicales et engins assignés
          </p>
        </div>

        <button
          onClick={() => handleOpenModal()}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium shadow-sm transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          Nouveau Conducteur / Opérateur
        </button>
      </div>

      {/* Alertes d'aptitude / expirations */}
      {(alertesMedicales.length > 0 || alertesPermis.length > 0) && (
        <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-sm text-red-900 dark:text-red-200">
              Conformité & Sécurité : Visites médicales ou Permis expirés / en alerte
            </p>
            <p className="text-xs text-red-700 dark:text-red-300">
              {alertesMedicales.length} visite(s) médicale(s) et {alertesPermis.length} permis de conduire requièrent une régularisation immédiate pour autoriser la conduite sur chantier.
            </p>
          </div>
        </div>
      )}

      {/* Filtres & Recherche */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher par nom, matricule, CACES..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-sm focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={statutFilter}
            onChange={e => setStatutFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
          >
            <option value="TOUS">Tous les statuts</option>
            <option value="DISPONIBLE">Disponible</option>
            <option value="EN_MISSION">En mission / Chantier</option>
            <option value="CONGE">En congé</option>
            <option value="SUSPENDU">Suspendu</option>
            <option value="INACTIF">Inactif</option>
          </select>
        </div>
      </div>

      {/* Liste des conducteurs */}
      {loading ? (
        <div className="p-12 text-center text-gray-500">Chargement de l'équipe conducteurs...</div>
      ) : filteredChauffeurs.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <UserCheck className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="font-semibold text-gray-900 dark:text-white">Aucun conducteur d'engin trouvé</p>
          <p className="text-sm text-gray-500 mt-1">Ajoutez vos chauffeurs et certifiez leurs CACES pour affectation sur chantier.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredChauffeurs.map(ch => {
            const site = sites.find(s => s.id === ch.site_rattachement_id)
            const engin = materiels.find(m => m.id === ch.materiel_actuel_id)
            const medExpired = isExpired(ch.date_expiration_visite_medicale)
            const medAlert = isExpiringSoon(ch.date_expiration_visite_medicale)
            const permExpired = isExpired(ch.date_expiration_permis)

            return (
              <div
                key={ch.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm hover:border-amber-500/50 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="text-xs font-mono font-semibold text-amber-600 dark:text-amber-400">
                        {ch.matricule}
                      </div>
                      <h3 className="font-bold text-gray-900 dark:text-white text-base">
                        {ch.nom_complet}
                      </h3>
                      {ch.telephone && (
                        <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                          <Phone className="w-3 h-3" />
                          {ch.telephone}
                        </p>
                      )}
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        ch.statut === 'DISPONIBLE'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : ch.statut === 'EN_MISSION'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                          : ch.statut === 'CONGE'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {ch.statut}
                    </span>
                  </div>

                  {/* Site & Engin actuel */}
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2.5 text-xs space-y-1.5 mb-3">
                    <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                      <span className="flex items-center gap-1">
                        <Building className="w-3 h-3 text-gray-400" /> Site base :
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {site?.nom_site || 'Non rattaché'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                      <span className="flex items-center gap-1">
                        <Truck className="w-3 h-3 text-gray-400" /> Engin assigné :
                      </span>
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        {engin ? `${engin.code_materiel} (${engin.designation})` : 'Aucun'}
                      </span>
                    </div>
                  </div>

                  {/* Habilitations CACES & Permis */}
                  <div className="space-y-2 mb-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
                      <Award className="w-3.5 h-3.5 text-amber-500" />
                      CACES & Certifications :
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {ch.habilitations_caces && ch.habilitations_caces.length > 0 ? (
                        ch.habilitations_caces.map((c, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 text-[11px] font-medium border border-amber-200 dark:border-amber-800/50"
                          >
                            {c}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-gray-400 italic">Aucun CACES enregistré</span>
                      )}
                    </div>

                    <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-1">
                      <FileCheck className="w-3 h-3 text-gray-400" /> Permis :{' '}
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {ch.categories_permis?.join(', ') || 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Validités médicales & permis */}
                  <div className="border-t border-gray-100 dark:border-gray-700/60 pt-2 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Visite médicale :</span>
                      <span
                        className={`font-medium ${
                          medExpired
                            ? 'text-red-600 font-bold'
                            : medAlert
                            ? 'text-amber-600 font-semibold'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {ch.date_expiration_visite_medicale || 'Non renseignée'}
                        {medExpired && ' (Expirée !)'}
                        {medAlert && ' (À renouveler)'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Permis valide jusqu'au :</span>
                      <span
                        className={`font-medium ${
                          permExpired ? 'text-red-600 font-bold' : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {ch.date_expiration_permis || 'Non renseigné'}
                        {permExpired && ' (Expiré !)'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-3 flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleOpenModal(ch)}
                    className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    title="Modifier"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(ch.id)}
                    className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modale Ajout / Édition */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-amber-600" />
                {editingChauffeur ? 'Modifier le conducteur d\'engin' : 'Nouveau Conducteur / Opérateur CACES'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Matricule / Identifiant *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.matricule || ''}
                    onChange={e => setFormData({ ...formData, matricule: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700 text-sm focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Nom complet & Prénom *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nom_complet || ''}
                    onChange={e => setFormData({ ...formData, nom_complet: e.target.value })}
                    placeholder="Ex: Koffi Mensah"
                    className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700 text-sm focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Téléphone
                  </label>
                  <input
                    type="text"
                    value={formData.telephone || ''}
                    onChange={e => setFormData({ ...formData, telephone: e.target.value })}
                    placeholder="+229 97 00 00 00"
                    className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Site de rattachement
                  </label>
                  <select
                    value={formData.site_rattachement_id || ''}
                    onChange={e => setFormData({ ...formData, site_rattachement_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700 text-sm"
                  >
                    <option value="">Sélectionner un site</option>
                    {sites.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.nom_site} ({s.ville})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Statut actuel
                  </label>
                  <select
                    value={formData.statut || 'DISPONIBLE'}
                    onChange={e => setFormData({ ...formData, statut: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700 text-sm"
                  >
                    <option value="DISPONIBLE">Disponible</option>
                    <option value="EN_MISSION">En mission / Chantier</option>
                    <option value="CONGE">En congé</option>
                    <option value="SUSPENDU">Suspendu</option>
                    <option value="INACTIF">Inactif</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Engin actuellement assigné
                  </label>
                  <select
                    value={formData.materiel_actuel_id || ''}
                    onChange={e => setFormData({ ...formData, materiel_actuel_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700 text-sm"
                  >
                    <option value="">Aucun engin assigné</option>
                    {materiels.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.code_materiel} - {m.designation} ({m.categorie})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Date expiration Permis de conduire
                  </label>
                  <input
                    type="date"
                    value={formData.date_expiration_permis || ''}
                    onChange={e => setFormData({ ...formData, date_expiration_permis: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Date expiration Visite Médicale
                  </label>
                  <input
                    type="date"
                    value={formData.date_expiration_visite_medicale || ''}
                    onChange={e => setFormData({ ...formData, date_expiration_visite_medicale: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700 text-sm"
                  />
                </div>
              </div>

              {/* Sélection CACES */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Habilitations & CACES R482 validés
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600 max-h-48 overflow-y-auto">
                  {CACES_PRESETS.map((caces, idx) => {
                    const isChecked = formData.habilitations_caces?.includes(caces)
                    return (
                      <label
                        key={idx}
                        className="flex items-center gap-2 text-xs text-gray-800 dark:text-gray-200 cursor-pointer hover:text-amber-600"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleCaces(caces)}
                          className="rounded text-amber-600 focus:ring-amber-500"
                        />
                        <span>{caces}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Notes & Observations
                </label>
                <textarea
                  rows={2}
                  value={formData.notes || ''}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Expérience spécifique, formations complémentaires..."
                  className="w-full px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700 text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors"
                >
                  {saving ? 'Enregistrement...' : 'Enregistrer le conducteur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
