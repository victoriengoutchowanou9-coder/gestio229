// =============================================================================
// GESTIO 229 — GESTION DES ORDONNANCES & PRESCRIPTIONS MÉDICALES
// =============================================================================
import React, { useState, useEffect } from 'react'
import {
  FileText,
  Search,
  Plus,
  Filter,
  CheckCircle2,
  Clock,
  User,
  Building,
  Calendar,
  AlertCircle,
  Eye,
  Pill,
  CheckCheck,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  pharmacieService,
  PharmacieOrdonnance,
  LignePrescription,
  StatutOrdonnance,
} from '../../../services/pharmacieService'
import { Link } from 'react-router-dom'

export default function PharmacieOrdonnancesPage() {
  const { currentCompany } = useTenant()
  const companyId = currentCompany?.id || 'demo-company-pharma'

  const [ordonnances, setOrdonnances] = useState<PharmacieOrdonnance[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatut, setFilterStatut] = useState<string>('TOUS')

  // Modal Nouvelle Ordonnance
  const [modalOpen, setModalOpen] = useState(false)
  const [nouvelleOrd, setNouvelleOrd] = useState<Partial<PharmacieOrdonnance>>({
    prescripteur_nom: '',
    prescripteur_specialite: 'Médecine Générale',
    etablissement_soins: '',
    patient_nom: '',
    patient_age: undefined,
    patient_telephone: '',
    date_prescription: new Date().toISOString().slice(0, 10),
    lignes: [],
  })

  // Saisie ligne dans le formulaire
  const [ligneEnCours, setLigneEnCours] = useState<Partial<LignePrescription>>({
    medicament_ou_dci: '',
    dosage: '',
    forme: 'Comprimé',
    posologie: '',
    quantite_prescrite: 1,
  })

  // Modal consultation ordonnance
  const [viewOrd, setViewOrd] = useState<PharmacieOrdonnance | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [messageAction, setMessageAction] = useState('')

  const chargerOrdonnances = async () => {
    try {
      setLoading(true)
      const list = await pharmacieService.getOrdonnances(companyId)
      setOrdonnances(list)
    } catch (err) {
      console.error('Erreur chargement ordonnances:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    chargerOrdonnances()
  }, [companyId])

  const handleAjouterLigne = () => {
    if (!ligneEnCours.medicament_ou_dci) {
      alert('Veuillez renseigner le médicament ou la DCI prescrite.')
      return
    }

    const nouvelleLigne: LignePrescription = {
      id: `l-${Date.now()}`,
      medicament_ou_dci: ligneEnCours.medicament_ou_dci,
      dosage: ligneEnCours.dosage || '',
      forme: ligneEnCours.forme || 'Comprimé',
      posologie: ligneEnCours.posologie || 'Selon prescription médicale',
      quantite_prescrite: Number(ligneEnCours.quantite_prescrite) || 1,
      quantite_delivree: 0,
      solde_a_servir: Number(ligneEnCours.quantite_prescrite) || 1,
    }

    setNouvelleOrd({
      ...nouvelleOrd,
      lignes: [...(nouvelleOrd.lignes || []), nouvelleLigne],
    })

    setLigneEnCours({
      medicament_ou_dci: '',
      dosage: '',
      forme: 'Comprimé',
      posologie: '',
      quantite_prescrite: 1,
    })
  }

  const handleSaveOrdonnance = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nouvelleOrd.patient_nom || !nouvelleOrd.prescripteur_nom) {
      alert('Veuillez renseigner le nom du patient et le prescripteur.')
      return
    }
    if (!nouvelleOrd.lignes || nouvelleOrd.lignes.length === 0) {
      alert('Veuillez ajouter au moins une ligne de prescription médicale.')
      return
    }

    try {
      setSaveLoading(true)
      await pharmacieService.saveOrdonnance(companyId, nouvelleOrd)
      setModalOpen(false)
      setMessageAction('Ordonnance médicale enregistrée avec succès.')
      setTimeout(() => setMessageAction(''), 4000)
      chargerOrdonnances()
    } catch (err: any) {
      alert(err.message || 'Erreur enregistrement ordonnance')
    } finally {
      setSaveLoading(false)
    }
  }

  const filteredOrds = ordonnances.filter((o) => {
    const matchSearch =
      o.numero_ordonnance.toLowerCase().includes(search.toLowerCase()) ||
      o.patient_nom.toLowerCase().includes(search.toLowerCase()) ||
      o.prescripteur_nom.toLowerCase().includes(search.toLowerCase()) ||
      (o.etablissement_soins || '').toLowerCase().includes(search.toLowerCase())

    const matchStatut = filterStatut === 'TOUS' || o.statut === filterStatut
    return matchSearch && matchStatut
  })

  const getStatutBadge = (statut: StatutOrdonnance) => {
    switch (statut) {
      case 'SERVIE':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
            <CheckCheck className="w-3.5 h-3.5" /> Totalement Servie
          </span>
        )
      case 'PARTIELLE':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> Partiellement Servie
          </span>
        )
      case 'EN_ATTENTE':
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> En attente de délivrance
          </span>
        )
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
            <FileText className="w-4 h-4" /> Prescription & Dispensation Réglementaire
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            Ordonnances Médicales & Suivi des Délivrances
          </h1>
          <p className="text-sm text-slate-500">
            Enregistrement des ordonnances, suivi des délivrances partielles/totales et traçabilité pour les médicaments soumis à prescription.
          </p>
        </div>

        <button
          onClick={() => {
            setNouvelleOrd({
              prescripteur_nom: '',
              prescripteur_specialite: 'Médecine Générale',
              etablissement_soins: '',
              patient_nom: '',
              patient_age: undefined,
              patient_telephone: '',
              date_prescription: new Date().toISOString().slice(0, 10),
              lignes: [],
            })
            setModalOpen(true)
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow transition"
        >
          <Plus className="w-4 h-4" /> Enregistrer une Ordonnance
        </button>
      </div>

      {messageAction && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          {messageAction}
        </div>
      )}

      {/* Barre de Recherche et Filtres */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par N° ordonnance, nom du patient, médecin ou clinique..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none"
          >
            <option value="TOUS">Tous statuts</option>
            <option value="EN_ATTENTE">En attente</option>
            <option value="PARTIELLE">Partiellement servie</option>
            <option value="SERVIE">Totalement servie</option>
          </select>
        </div>
      </div>

      {/* Tableau des Ordonnances */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 uppercase text-xs font-semibold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3">Réf Ordonnance & Date</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Prescripteur & Établissement</th>
                <th className="px-4 py-3">Lignes Prescrites</th>
                <th className="px-4 py-3">Statut Délivrance</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Chargement des ordonnances...
                  </td>
                </tr>
              ) : filteredOrds.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Aucune ordonnance trouvée.
                  </td>
                </tr>
              ) : (
                filteredOrds.map((ord) => (
                  <tr key={ord.id} className="hover:bg-slate-50 dark:hover:bg-slate-750 transition">
                    <td className="px-4 py-3">
                      <div className="font-mono font-bold text-blue-600 dark:text-blue-400">
                        {ord.numero_ordonnance}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" /> Prescrit le {ord.date_prescription}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        {ord.patient_nom}
                      </div>
                      <div className="text-xs text-slate-500">
                        {ord.patient_age ? `${ord.patient_age} ans` : ''} {ord.patient_telephone ? `• Tel: ${ord.patient_telephone}` : ''}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800 dark:text-slate-200">
                        {ord.prescripteur_nom}
                      </div>
                      <div className="text-xs text-slate-500">
                        {ord.etablissement_soins || ord.prescripteur_specialite || 'Cabinet médical'}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="text-xs space-y-0.5">
                        {ord.lignes.map((l, i) => (
                          <div key={i} className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                            <span className="font-semibold">{l.medicament_ou_dci}</span> ({l.forme} {l.dosage}) :
                            <span className="text-emerald-600 font-bold ml-1">
                              Servi {l.quantite_delivree}/{l.quantite_prescrite}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      {getStatutBadge(ord.statut)}
                    </td>

                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setViewOrd(ord)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                          title="Consulter le détail"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {ord.statut !== 'SERVIE' && (
                          <Link
                            to="/dashboard/pharmacie/vente-pos"
                            className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded text-xs font-bold border border-emerald-200 flex items-center gap-1"
                          >
                            <Pill className="w-3.5 h-3.5" /> Servir
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Consultation Détail Ordonnance */}
      {viewOrd && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  Ordonnance {viewOrd.numero_ordonnance}
                </h3>
                <div className="text-xs text-slate-500">
                  Prescripteur : {viewOrd.prescripteur_nom} • Patient : {viewOrd.patient_nom}
                </div>
              </div>
              <button onClick={() => setViewOrd(null)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-900 p-3 rounded-xl">
                <div>
                  <span className="text-slate-500 block">Date Prescription :</span>
                  <span className="font-bold text-slate-900 dark:text-white">{viewOrd.date_prescription}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Statut Officine :</span>
                  <div>{getStatutBadge(viewOrd.statut)}</div>
                </div>
              </div>

              <div>
                <div className="font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase text-[11px]">
                  Lignes Prescrites & État de Délivrance :
                </div>
                <div className="space-y-2">
                  {viewOrd.lignes.map((l, i) => (
                    <div key={i} className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
                      <div className="flex justify-between font-bold text-slate-900 dark:text-white">
                        <span>{l.medicament_ou_dci} ({l.forme} {l.dosage})</span>
                        <span className="text-blue-600">Prescrit : {l.quantite_prescrite}</span>
                      </div>
                      <div className="text-slate-500 mt-1 italic">
                        Posologie : {l.posologie}
                      </div>
                      <div className="flex justify-between text-xs font-semibold pt-1 mt-1 border-t border-slate-200 dark:border-slate-700">
                        <span className="text-emerald-600">Délivré : {l.quantite_delivree}</span>
                        <span className="text-amber-600">Reste à servir : {l.solde_a_servir}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setViewOrd(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Saisie Nouvelle Ordonnance */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 my-8">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" />
              Enregistrer une Nouvelle Ordonnance
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Enregistrez le prescripteur, le patient et les lignes de prescription à délivrer au comptoir.
            </p>

            <form onSubmit={handleSaveOrdonnance} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Médecin Prescripteur *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Dr. Mensah KOFFI"
                    value={nouvelleOrd.prescripteur_nom || ''}
                    onChange={(e) => setNouvelleOrd({ ...nouvelleOrd, prescripteur_nom: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Établissement / Clinique
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: CNHU-HKM, Clinique Mahouna..."
                    value={nouvelleOrd.etablissement_soins || ''}
                    onChange={(e) => setNouvelleOrd({ ...nouvelleOrd, etablissement_soins: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nom du Patient *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Mme Sidoine AÏVOHO"
                    value={nouvelleOrd.patient_nom || ''}
                    onChange={(e) => setNouvelleOrd({ ...nouvelleOrd, patient_nom: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Âge
                    </label>
                    <input
                      type="number"
                      placeholder="35"
                      value={nouvelleOrd.patient_age || ''}
                      onChange={(e) => setNouvelleOrd({ ...nouvelleOrd, patient_age: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Téléphone
                    </label>
                    <input
                      type="text"
                      placeholder="+229 ..."
                      value={nouvelleOrd.patient_telephone || ''}
                      onChange={(e) => setNouvelleOrd({ ...nouvelleOrd, patient_telephone: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Lignes de prescription */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase">
                  Ajouter des Médicaments Prescrits :
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl space-y-2 border border-slate-200 dark:border-slate-700">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div className="md:col-span-2">
                      <input
                        type="text"
                        placeholder="Médicament ou DCI (ex: Amoxicilline 500mg)"
                        value={ligneEnCours.medicament_ou_dci || ''}
                        onChange={(e) => setLigneEnCours({ ...ligneEnCours, medicament_ou_dci: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Posologie (ex: 1 cp × 3/j)"
                        value={ligneEnCours.posologie || ''}
                        onChange={(e) => setLigneEnCours({ ...ligneEnCours, posologie: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        placeholder="Qté"
                        value={ligneEnCours.quantite_prescrite || 1}
                        onChange={(e) => setLigneEnCours({ ...ligneEnCours, quantite_prescrite: Number(e.target.value) })}
                        className="w-16 px-2 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-center font-bold"
                      />
                      <button
                        type="button"
                        onClick={handleAjouterLigne}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold"
                      >
                        + Ajouter
                      </button>
                    </div>
                  </div>

                  {nouvelleOrd.lignes && nouvelleOrd.lignes.length > 0 && (
                    <div className="space-y-1 pt-2">
                      {nouvelleOrd.lignes.map((l, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs bg-white dark:bg-slate-800 p-2 rounded border border-slate-200">
                          <div>
                            <span className="font-bold">{l.medicament_ou_dci}</span> — {l.posologie}
                          </div>
                          <span className="font-bold text-blue-600">Qté: {l.quantite_prescrite}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="px-5 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow"
                >
                  {saveLoading ? 'Enregistrement...' : 'Enregistrer l’Ordonnance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
