import React, { useState, useEffect } from 'react'
import {
  Truck,
  Plus,
  Search,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  MapPin,
  User,
  Gauge
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  transportService,
  TransportMissionFret,
  TransportBus,
  TransportChauffeur
} from '../../../services/transportService'

export const TransportMissionsFretPage: React.FC = () => {
  const { companyId: ctxCompanyId, sectorSlug, company } = useTenant()
  const companyId = ctxCompanyId || 'demo-company'
  const tenant = company

  const [missions, setMissions] = useState<TransportMissionFret[]>([])
  const [busList, setBusList] = useState<TransportBus[]>([])
  const [chauffeurs, setChauffeurs] = useState<TransportChauffeur[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const [showModal, setShowModal] = useState(false)
  const [formMission, setFormMission] = useState({
    client_nom: '',
    client_telephone: '',
    type_marchandise: 'Marchandises Générales / Vivres',
    vehicule_immatriculation: '',
    chauffeur_nom: '',
    ville_depart: 'Cotonou',
    ville_destination: 'Malanville',
    date_mission: new Date().toISOString().slice(0, 10),
    kilometrage_depart: 120000,
    prix_prestation: 350000,
    frais_route: 45000,
    frais_carburant: 85000,
    observations: '',
  })

  const loadData = async () => {
    setLoading(true)
    try {
      const [allMissions, allBus, allChauf] = await Promise.all([
        transportService.fetchTransportMissions(companyId),
        transportService.fetchTransportBus(companyId),
        transportService.fetchTransportChauffeurs(companyId)
      ])
      setMissions(allMissions)
      setBusList(allBus)
      setChauffeurs(allChauf)

      if (allBus.length > 0 && !formMission.vehicule_immatriculation) {
        setFormMission(prev => ({ ...prev, vehicule_immatriculation: allBus[0].immatriculation }))
      }
      if (allChauf.length > 0 && !formMission.chauffeur_nom) {
        setFormMission(prev => ({ ...prev, chauffeur_nom: `${allChauf[0].nom} ${allChauf[0].prenom}` }))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [companyId])

  const handleCreerMission = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await transportService.creerTransportMission(companyId, formMission)
      setShowModal(false)
      await loadData()
    } catch (e) {
      alert('Erreur création mission')
    }
  }

  const filtered = missions.filter(m =>
    m.numero_ordre.toLowerCase().includes(search.toLowerCase()) ||
    m.client_nom.toLowerCase().includes(search.toLowerCase()) ||
    m.ville_destination.toLowerCase().includes(search.toLowerCase()) ||
    m.vehicule_immatriculation.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 bg-slate-950 text-slate-100 min-h-screen">
      {/* ── En-tête ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Missions de Fret & Transport Contractuel
              </h1>
              <p className="text-sm text-slate-400">
                Ordres de transport, affrètement, suivi kilométrique, frais de route et livraison
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-lg shadow-blue-600/20 transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Nouvelle Mission de Fret
        </button>
      </div>

      {/* ── Recherche ── */}
      <div className="relative w-full sm:w-72">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
        <input
          type="text"
          placeholder="Client, destination, véhicule..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* ── Liste des Missions ── */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm bg-slate-900/50 rounded-2xl border border-slate-800">
            Aucune mission de fret enregistrée.
          </div>
        ) : (
          filtered.map(mis => (
            <div
              key={mis.id}
              className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              <div className="space-y-1 lg:w-1/3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    {mis.numero_ordre}
                  </span>
                  <h3 className="font-bold text-white text-base">{mis.client_nom}</h3>
                </div>
                <div className="text-xs text-slate-400">
                  {mis.type_marchandise} • Tél : {mis.client_telephone || 'N/A'}
                </div>
              </div>

              <div className="space-y-1 text-xs text-slate-300 lg:w-1/4">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{mis.ville_depart} ➔ {mis.ville_destination}</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Truck className="w-3.5 h-3.5 text-slate-500" />
                  <span>Véhicule : <strong className="text-white">{mis.vehicule_immatriculation}</strong></span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  <span>Chauffeur : <strong className="text-white">{mis.chauffeur_nom}</strong></span>
                </div>
              </div>

              <div className="text-xs lg:w-48">
                <span className="text-slate-400 block text-[11px]">Facturation Prestation :</span>
                <strong className="text-base font-black text-emerald-400">
                  {mis.prix_prestation.toLocaleString('fr-FR')} FCFA
                </strong>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Frais route : {mis.frais_route.toLocaleString('fr-FR')} F • Carb : {mis.frais_carburant.toLocaleString('fr-FR')} F
                </div>
              </div>

              <div className="flex items-center gap-3 lg:justify-end">
                <span className={`px-2.5 py-1 text-xs font-semibold rounded-lg ${
                  mis.statut === 'EN_COURS' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                  mis.statut === 'LIVREE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                  'bg-slate-800 text-slate-300'
                }`}>
                  {mis.statut}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Modale Mission ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Truck className="w-5 h-5 text-blue-400" />
              Créer un Ordre de Mission Fret
            </h3>

            <form onSubmit={handleCreerMission} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Nom du Client / Entreprise *</label>
                  <input
                    type="text"
                    required
                    value={formMission.client_nom}
                    onChange={e => setFormMission({ ...formMission, client_nom: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Téléphone Client</label>
                  <input
                    type="tel"
                    value={formMission.client_telephone}
                    onChange={e => setFormMission({ ...formMission, client_telephone: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-medium">Nature des marchandises *</label>
                <input
                  type="text"
                  required
                  value={formMission.type_marchandise}
                  onChange={e => setFormMission({ ...formMission, type_marchandise: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Ville de Départ *</label>
                  <input
                    type="text"
                    required
                    value={formMission.ville_depart}
                    onChange={e => setFormMission({ ...formMission, ville_depart: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Ville de Destination *</label>
                  <input
                    type="text"
                    required
                    value={formMission.ville_destination}
                    onChange={e => setFormMission({ ...formMission, ville_destination: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Véhicule assigné *</label>
                  <select
                    value={formMission.vehicule_immatriculation}
                    onChange={e => setFormMission({ ...formMission, vehicule_immatriculation: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  >
                    {busList.map(b => (
                      <option key={b.id} value={b.immatriculation}>{b.immatriculation} ({b.marque})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Chauffeur assigné *</label>
                  <select
                    value={formMission.chauffeur_nom}
                    onChange={e => setFormMission({ ...formMission, chauffeur_nom: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  >
                    {chauffeurs.map(c => (
                      <option key={c.id} value={`${c.nom} ${c.prenom}`}>{c.nom} {c.prenom}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Prix Prestation (FCFA) *</label>
                  <input
                    type="number"
                    step={5000}
                    value={formMission.prix_prestation}
                    onChange={e => setFormMission({ ...formMission, prix_prestation: Number(e.target.value) })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-emerald-400 font-bold"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Frais Carburant</label>
                  <input
                    type="number"
                    value={formMission.frais_carburant}
                    onChange={e => setFormMission({ ...formMission, frais_carburant: Number(e.target.value) })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Frais de Route / Péage</label>
                  <input
                    type="number"
                    value={formMission.frais_route}
                    onChange={e => setFormMission({ ...formMission, frais_route: Number(e.target.value) })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-slate-300 hover:bg-slate-800 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow"
                >
                  Valider l'Ordre de Mission
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default TransportMissionsFretPage
