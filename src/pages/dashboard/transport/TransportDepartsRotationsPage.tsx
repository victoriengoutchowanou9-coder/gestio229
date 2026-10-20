import React, { useState, useEffect } from 'react'
import {
  Calendar,
  Clock,
  Bus,
  Users,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Play,
  Check,
  Ban,
  ArrowRight,
  RefreshCw,
  Ticket
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTenant } from '../../../hooks/useTenant'
import {
  transportService,
  TransportDepart,
  TransportLigne,
  TransportBus,
  TransportChauffeur
} from '../../../services/transportService'

export const TransportDepartsRotationsPage: React.FC = () => {
  const { companyId: ctxCompanyId, sectorSlug, company } = useTenant()
  const companyId = ctxCompanyId || 'demo-company'
  const tenant = company
  const prefix = sectorSlug ? `/app/${sectorSlug}` : '/dashboard'

  const [departs, setDeparts] = useState<TransportDepart[]>([])
  const [lignes, setLignes] = useState<TransportLigne[]>([])
  const [busList, setBusList] = useState<TransportBus[]>([])
  const [chauffeurs, setChauffeurs] = useState<TransportChauffeur[]>([])
  const [search, setSearch] = useState('')
  const [filterStatut, setFilterStatut] = useState<string>('TOUS')
  const [loading, setLoading] = useState(true)

  // Modale nouveau départ
  const [showModal, setShowModal] = useState(false)
  const [formDepart, setFormDepart] = useState({
    ligneId: '',
    dateDepart: new Date().toISOString().slice(0, 10),
    heureDepart: '07:00',
    busId: '',
    chauffeurId: '',
    convoyeurNom: '',
    prixBase: 8500,
  })
  const [errorMessage, setErrorMessage] = useState('')

  const loadAll = async () => {
    setLoading(true)
    try {
      const [depData, ligData, busData, chaufData] = await Promise.all([
        transportService.fetchTransportDeparts(companyId),
        transportService.fetchTransportLignes(companyId),
        transportService.fetchTransportBus(companyId),
        transportService.fetchTransportChauffeurs(companyId)
      ])
      setDeparts(depData)
      setLignes(ligData)
      setBusList(busData)
      setChauffeurs(chaufData)

      if (ligData.length > 0 && !formDepart.ligneId) {
        setFormDepart(prev => ({ ...prev, ligneId: ligData[0].id }))
      }
      if (busData.length > 0 && !formDepart.busId) {
        const dispoBus = busData.find(b => b.statut === 'DISPONIBLE') || busData[0]
        setFormDepart(prev => ({ ...prev, busId: dispoBus.id }))
      }
      if (chaufData.length > 0 && !formDepart.chauffeurId) {
        const dispoChauf = chaufData.find(c => c.statut === 'DISPONIBLE') || chaufData[0]
        setFormDepart(prev => ({ ...prev, chauffeurId: dispoChauf.id }))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [companyId])

  const handleCreerDepart = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage('')

    try {
      const res = await transportService.creerTransportDepart(companyId, formDepart)
      if (!res.success) {
        setErrorMessage(res.error || 'Erreur lors de la programmation du départ')
        return
      }

      setShowModal(false)
      await loadAll()
    } catch (err: any) {
      setErrorMessage(err.message || 'Erreur inattendue')
    }
  }

  const handleChangerStatut = async (departId: string, nouveauStatut: TransportDepart['statut']) => {
    try {
      await transportService.modifierStatutDepart(companyId, departId, nouveauStatut)
      await loadAll()
    } catch (e) {
      alert('Erreur changement statut')
    }
  }

  const filteredDeparts = departs.filter(d => {
    const matchSearch =
      d.ligne_nom.toLowerCase().includes(search.toLowerCase()) ||
      d.bus_immatriculation.toLowerCase().includes(search.toLowerCase()) ||
      d.chauffeur_nom.toLowerCase().includes(search.toLowerCase())
    const matchStatut = filterStatut === 'TOUS' || d.statut === filterStatut
    return matchSearch && matchStatut
  })

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 bg-slate-950 text-slate-100 min-h-screen">
      {/* ── En-tête ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Horaires, Départs & Rotations
              </h1>
              <p className="text-sm text-slate-400">
                Planning d'exploitation, affectation bus/chauffeurs et contrôle anti-conflit
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setErrorMessage('')
            setShowModal(true)
          }}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-lg shadow-blue-600/20 transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Programmer un Départ
        </button>
      </div>

      {/* ── Filtres & Barre d'outils ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {['TOUS', 'PROGRAMME', 'EMBARQUEMENT', 'EN_ROUTE', 'ARRIVE', 'COMPLET', 'ANNULE'].map(st => (
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
            placeholder="Rechercher ligne, bus, chauffeur..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* ── Liste des Départs ── */}
      <div className="space-y-3">
        {filteredDeparts.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm bg-slate-900/50 rounded-2xl border border-slate-800">
            Aucun départ correspondant aux filtres.
          </div>
        ) : (
          filteredDeparts.map(dep => {
            const fillPercent = Math.round((dep.places_vendues / Math.max(1, dep.capacite_totale)) * 100)

            return (
              <div
                key={dep.id}
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800/80 hover:border-slate-700 transition flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                {/* Ligne & Horaires */}
                <div className="space-y-1.5 lg:w-1/3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                      {dep.ligne_code}
                    </span>
                    <h3 className="font-bold text-white text-base">
                      {dep.ligne_nom}
                    </h3>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-300">
                    <span className="flex items-center gap-1 font-semibold text-emerald-400">
                      <Clock className="w-3.5 h-3.5" /> Départ : {dep.heure_depart}
                    </span>
                    <span className="text-slate-500">➔</span>
                    <span className="text-slate-400">
                      Arrivée estimée : {dep.heure_arrivee_estimee}
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400">{dep.date_depart}</span>
                  </div>
                </div>

                {/* Ressources affectées (Bus & Chauffeur) */}
                <div className="space-y-1 text-xs text-slate-400 lg:w-1/4">
                  <div className="flex items-center gap-1.5">
                    <Bus className="w-3.5 h-3.5 text-blue-400" />
                    <span>Bus : <strong className="text-white">{dep.bus_immatriculation}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span>Chauffeur : <strong className="text-white">{dep.chauffeur_nom}</strong></span>
                  </div>
                  {dep.convoyeur_nom && (
                    <div className="text-[11px] text-slate-500">
                      Convoyeur : {dep.convoyeur_nom}
                    </div>
                  )}
                </div>

                {/* Places & Remplissage */}
                <div className="lg:w-48">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Occupation :</span>
                    <span className="font-bold text-white">{dep.places_vendues} / {dep.capacite_totale} places</span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
                    <div
                      className={`h-full rounded-full transition-all ${
                        fillPercent >= 90 ? 'bg-rose-500' : fillPercent >= 60 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, fillPercent)}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 flex justify-between">
                    <span>{fillPercent}% rempli</span>
                    <span className="font-semibold text-emerald-400">{dep.places_restantes} restantes</span>
                  </div>
                </div>

                {/* Statut & Actions Opérationnelles */}
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <span className={`px-2.5 py-1 text-xs font-semibold rounded-lg ${
                    dep.statut === 'EN_ROUTE' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                    dep.statut === 'EMBARQUEMENT' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                    dep.statut === 'COMPLET' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                    dep.statut === 'ARRIVE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                    dep.statut === 'ANNULE' ? 'bg-slate-800 text-slate-500 line-through' :
                    'bg-slate-800 text-slate-300'
                  }`}>
                    {dep.statut}
                  </span>

                  {dep.statut === 'PROGRAMME' && (
                    <button
                      onClick={() => handleChangerStatut(dep.id, 'EMBARQUEMENT')}
                      className="px-2.5 py-1 text-xs font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition"
                    >
                      Embarquer
                    </button>
                  )}

                  {dep.statut === 'EMBARQUEMENT' && (
                    <button
                      onClick={() => handleChangerStatut(dep.id, 'EN_ROUTE')}
                      className="px-2.5 py-1 text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg transition"
                    >
                      Faire Partir
                    </button>
                  )}

                  {dep.statut === 'EN_ROUTE' && (
                    <button
                      onClick={() => handleChangerStatut(dep.id, 'ARRIVE')}
                      className="px-2.5 py-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition"
                    >
                      Terminer Arrivée
                    </button>
                  )}

                  {dep.statut !== 'ARRIVE' && dep.statut !== 'ANNULE' && (
                    <Link
                      to={`${prefix}/billetterie-bus?departId=${dep.id}`}
                      className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm transition"
                    >
                      <Ticket className="w-3.5 h-3.5" /> Vendre Billet
                    </Link>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── Modale Création Départ ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-400" />
              Programmer un Départ de Bus
            </h3>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleCreerDepart} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-medium">Ligne de bus *</label>
                <select
                  required
                  value={formDepart.ligneId}
                  onChange={e => setFormDepart({ ...formDepart, ligneId: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                >
                  {lignes.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.code_ligne} — {l.nom_ligne} ({l.ville_origine} ➔ {l.ville_destination})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Date de départ *</label>
                  <input
                    type="date"
                    required
                    value={formDepart.dateDepart}
                    onChange={e => setFormDepart({ ...formDepart, dateDepart: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Heure de départ *</label>
                  <input
                    type="time"
                    required
                    value={formDepart.heureDepart}
                    onChange={e => setFormDepart({ ...formDepart, heureDepart: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Bus assigné *</label>
                  <select
                    required
                    value={formDepart.busId}
                    onChange={e => setFormDepart({ ...formDepart, busId: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  >
                    {busList.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.immatriculation} ({b.marque} - {b.places_commercialisables} pl.) [{b.statut}]
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Chauffeur assigné *</label>
                  <select
                    required
                    value={formDepart.chauffeurId}
                    onChange={e => setFormDepart({ ...formDepart, chauffeurId: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  >
                    {chauffeurs.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.nom} {c.prenom} (Permis {c.categories_permis.join('/')}) [{c.statut}]
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Convoyeur / Chef de bord</label>
                  <input
                    type="text"
                    placeholder="Nom du convoyeur"
                    value={formDepart.convoyeurNom}
                    onChange={e => setFormDepart({ ...formDepart, convoyeurNom: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Tarif trajet complet (FCFA) *</label>
                  <input
                    type="number"
                    step={500}
                    value={formDepart.prixBase}
                    onChange={e => setFormDepart({ ...formDepart, prixBase: Number(e.target.value) })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-bold text-emerald-400"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
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
                  Confirmer le Départ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default TransportDepartsRotationsPage
