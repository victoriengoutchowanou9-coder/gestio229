import React, { useState, useEffect } from 'react'
import {
  Bus,
  Plus,
  Search,
  Filter,
  Edit2,
  ShieldCheck,
  AlertTriangle,
  Calendar,
  Wrench,
  Gauge,
  CheckCircle2
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  transportService,
  TransportBus
} from '../../../services/transportService'

export const TransportParcBusPage: React.FC = () => {
  const { companyId: ctxCompanyId, sectorSlug, company } = useTenant()
  const companyId = ctxCompanyId || 'demo-company'
  const tenant = company

  const [busList, setBusList] = useState<TransportBus[]>([])
  const [search, setSearch] = useState('')
  const [filterStatut, setFilterStatut] = useState<string>('TOUS')
  const [loading, setLoading] = useState(true)

  // Modale création/édition de bus
  const [showModal, setShowModal] = useState(false)
  const [formBus, setFormBus] = useState<Partial<TransportBus>>({
    immatriculation: '',
    marque: '',
    modele: '',
    categorie: 'VIP Climatise',
    capacite_passagers: 55,
    places_commercialisables: 53,
    capacite_soute_kg: 1500,
    plan_sieges_actif: true,
    agence_rattachement: 'Cotonou',
    kilometrage: 100000,
    statut: 'DISPONIBLE',
    date_expiration_assurance: '',
    date_expiration_visite_technique: '',
  })

  const loadBus = async () => {
    setLoading(true)
    try {
      const data = await transportService.fetchTransportBus(companyId)
      setBusList(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBus()
  }, [companyId])

  const handleSaveBus = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await transportService.saveTransportBus(companyId, formBus)
      setShowModal(false)
      await loadBus()
    } catch (e) {
      alert('Erreur enregistrement bus')
    }
  }

  const filteredBus = busList.filter(b => {
    const matchSearch =
      b.immatriculation.toLowerCase().includes(search.toLowerCase()) ||
      b.marque.toLowerCase().includes(search.toLowerCase()) ||
      b.modele.toLowerCase().includes(search.toLowerCase()) ||
      b.agence_rattachement.toLowerCase().includes(search.toLowerCase())
    const matchStatut = filterStatut === 'TOUS' || b.statut === filterStatut
    return matchSearch && matchStatut
  })

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 bg-slate-950 text-slate-100 min-h-screen">
      {/* ── En-tête ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <Bus className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Parc Automobile & Flotte de Bus
              </h1>
              <p className="text-sm text-slate-400">
                Inventaire des autocars, capacités passagers & soutes, plans de sièges et contrôle technique
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setFormBus({
              immatriculation: `AY ${Math.floor(1000 + Math.random() * 9000)} RB`,
              marque: 'Mercedes-Benz',
              modele: 'Travego VIP',
              categorie: 'VIP Climatise',
              capacite_passagers: 55,
              places_commercialisables: 53,
              capacite_soute_kg: 1500,
              plan_sieges_actif: true,
              agence_rattachement: 'Cotonou',
              kilometrage: 120000,
              statut: 'DISPONIBLE',
              date_expiration_assurance: '2027-06-30',
              date_expiration_visite_technique: '2027-04-15',
            })
            setShowModal(true)
          }}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-lg shadow-blue-600/20 transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Ajouter un Bus
        </button>
      </div>

      {/* ── Filtres ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {['TOUS', 'DISPONIBLE', 'AFFECTE', 'EN_ROUTE', 'MAINTENANCE', 'IMMOBILISE'].map(st => (
            <button
              key={st}
              onClick={() => setFilterStatut(st)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                filterStatut === st
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Immatriculation, marque..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* ── Grille des Bus ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredBus.length === 0 ? (
          <div className="col-span-full p-12 text-center text-slate-500 text-sm bg-slate-900/50 rounded-2xl border border-slate-800">
            Aucun bus ne correspond aux critères.
          </div>
        ) : (
          filteredBus.map(bus => (
            <div
              key={bus.id}
              className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-black px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    {bus.immatriculation}
                  </span>
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-lg ${
                    bus.statut === 'DISPONIBLE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                    bus.statut === 'AFFECTE' || bus.statut === 'EN_ROUTE' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                    'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  }`}>
                    {bus.statut}
                  </span>
                </div>

                <div className="mt-3">
                  <h3 className="font-bold text-base text-white">{bus.marque} {bus.modele}</h3>
                  <span className="text-xs text-slate-400 font-medium">{bus.categorie} • Agence {bus.agence_rattachement}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-slate-800/80 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Places assises :</span>
                    <strong className="text-white text-sm font-bold">
                      {bus.places_commercialisables} <span className="text-[10px] text-slate-400 font-normal">/ {bus.capacite_passagers} max</span>
                    </strong>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {bus.plan_sieges_actif ? 'Sièges numérotés' : 'Placement libre'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Capacité soute :</span>
                    <strong className="text-white text-sm font-bold">{bus.capacite_soute_kg || 1000} kg</strong>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Fret & Bagages</span>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-1 text-xs text-slate-400">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1"><Gauge className="w-3.5 h-3.5 text-slate-500" /> Kilométrage :</span>
                    <strong className="text-slate-200">{bus.kilometrage.toLocaleString('fr-FR')} km</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Assurance :</span>
                    <span className="text-slate-300 font-mono text-[11px]">{bus.date_expiration_assurance || 'Non renseignée'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1"><Wrench className="w-3.5 h-3.5 text-amber-400" /> Visite Tech. :</span>
                    <span className="text-slate-300 font-mono text-[11px]">{bus.date_expiration_visite_technique || 'Non renseignée'}</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end">
                <button
                  onClick={() => {
                    setFormBus(bus)
                    setShowModal(true)
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Modifier Fiche
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Modale Bus ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">
              {formBus.id ? 'Modifier le Véhicule' : 'Enregistrer un Bus'}
            </h3>

            <form onSubmit={handleSaveBus} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Immatriculation *</label>
                  <input
                    type="text"
                    required
                    value={formBus.immatriculation}
                    onChange={e => setFormBus({ ...formBus, immatriculation: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Agence de rattachement *</label>
                  <input
                    type="text"
                    required
                    value={formBus.agence_rattachement}
                    onChange={e => setFormBus({ ...formBus, agence_rattachement: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Marque *</label>
                  <input
                    type="text"
                    required
                    value={formBus.marque}
                    onChange={e => setFormBus({ ...formBus, marque: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Modèle *</label>
                  <input
                    type="text"
                    required
                    value={formBus.modele}
                    onChange={e => setFormBus({ ...formBus, modele: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Catégorie *</label>
                  <select
                    value={formBus.categorie}
                    onChange={e => setFormBus({ ...formBus, categorie: e.target.value as any })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  >
                    <option value="VIP Climatise">VIP Climatisé</option>
                    <option value="Standard">Standard</option>
                    <option value="Minibus">Minibus</option>
                    <option value="Car Courrier">Car Courrier</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Places vendables *</label>
                  <input
                    type="number"
                    required
                    value={formBus.places_commercialisables}
                    onChange={e => setFormBus({ ...formBus, places_commercialisables: Number(e.target.value) })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Soute (kg)</label>
                  <input
                    type="number"
                    value={formBus.capacite_soute_kg}
                    onChange={e => setFormBus({ ...formBus, capacite_soute_kg: Number(e.target.value) })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Kilométrage actuel</label>
                  <input
                    type="number"
                    value={formBus.kilometrage}
                    onChange={e => setFormBus({ ...formBus, kilometrage: Number(e.target.value) })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Statut</label>
                  <select
                    value={formBus.statut}
                    onChange={e => setFormBus({ ...formBus, statut: e.target.value as any })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  >
                    <option value="DISPONIBLE">Disponible</option>
                    <option value="AFFECTE">Affecté</option>
                    <option value="EN_ROUTE">En Route</option>
                    <option value="MAINTENANCE">Maintenance</option>
                    <option value="IMMOBILISE">Immobilisé</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Expiration Assurance</label>
                  <input
                    type="date"
                    value={formBus.date_expiration_assurance}
                    onChange={e => setFormBus({ ...formBus, date_expiration_assurance: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Expiration Visite Technique</label>
                  <input
                    type="date"
                    value={formBus.date_expiration_visite_technique}
                    onChange={e => setFormBus({ ...formBus, date_expiration_visite_technique: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="checkPlan"
                  checked={formBus.plan_sieges_actif}
                  onChange={e => setFormBus({ ...formBus, plan_sieges_actif: e.target.checked })}
                  className="rounded border-slate-700 text-blue-600 focus:ring-0"
                />
                <label htmlFor="checkPlan" className="text-xs text-slate-300 cursor-pointer">
                  Activer le plan de sièges numérotés lors de la vente de billets
                </label>
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
                  className="px-4 py-2 font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default TransportParcBusPage
