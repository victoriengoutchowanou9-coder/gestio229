import React, { useState, useEffect } from 'react'
import {
  Users,
  Plus,
  Search,
  Edit2,
  ShieldCheck,
  Calendar,
  Phone,
  AlertTriangle,
  Award
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  transportService,
  TransportChauffeur
} from '../../../services/transportService'

export const TransportChauffeursPage: React.FC = () => {
  const { companyId: ctxCompanyId, sectorSlug, company } = useTenant()
  const companyId = ctxCompanyId || 'demo-company'
  const tenant = company

  const [chauffeurs, setChauffeurs] = useState<TransportChauffeur[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const [showModal, setShowModal] = useState(false)
  const [formChauf, setFormChauf] = useState<Partial<TransportChauffeur>>({
    nom: '',
    prenom: '',
    telephone: '+229 ',
    numero_permis: '',
    categories_permis: ['D'],
    date_expiration_permis: '2028-01-01',
    statut: 'DISPONIBLE',
    agence: 'Cotonou',
  })

  const loadData = async () => {
    setLoading(true)
    try {
      const data = await transportService.fetchTransportChauffeurs(companyId)
      setChauffeurs(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [companyId])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await transportService.saveTransportChauffeur(companyId, formChauf)
      setShowModal(false)
      await loadData()
    } catch (e) {
      alert('Erreur enregistrement chauffeur')
    }
  }

  const filtered = chauffeurs.filter(c =>
    c.nom.toLowerCase().includes(search.toLowerCase()) ||
    c.prenom.toLowerCase().includes(search.toLowerCase()) ||
    c.numero_permis.toLowerCase().includes(search.toLowerCase()) ||
    c.telephone.includes(search)
  )

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 bg-slate-950 text-slate-100 min-h-screen">
      {/* ── En-tête ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Chauffeurs & Personnel Roulant
              </h1>
              <p className="text-sm text-slate-400">
                Fiches des conducteurs, catégories de permis (D/C/B), validité et affectations
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setFormChauf({
              nom: '',
              prenom: '',
              telephone: '+229 97 00 00 00',
              numero_permis: `BEN-D-${Math.floor(10000 + Math.random() * 90000)}`,
              categories_permis: ['D', 'C'],
              date_expiration_permis: '2028-12-31',
              statut: 'DISPONIBLE',
              agence: 'Cotonou',
            })
            setShowModal(true)
          }}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-lg shadow-blue-600/20 transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Nouveau Conducteur
        </button>
      </div>

      {/* ── Recherche ── */}
      <div className="relative w-full sm:w-72">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
        <input
          type="text"
          placeholder="Nom, permis, téléphone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* ── Grille des Chauffeurs ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.length === 0 ? (
          <div className="col-span-full p-12 text-center text-slate-500 text-sm bg-slate-900/50 rounded-2xl border border-slate-800">
            Aucun conducteur trouvé.
          </div>
        ) : (
          filtered.map(chauf => (
            <div
              key={chauf.id}
              className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-lg ${
                    chauf.statut === 'DISPONIBLE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                    chauf.statut === 'EN_MISSION' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                    'bg-slate-800 text-slate-400'
                  }`}>
                    {chauf.statut}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Agence {chauf.agence}
                  </span>
                </div>

                <div className="mt-3">
                  <h3 className="font-bold text-base text-white">{chauf.nom} {chauf.prenom}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                    <Phone className="w-3.5 h-3.5 text-slate-500" />
                    <span>{chauf.telephone}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Permis de Conduire :</span>
                    <strong className="text-white font-mono">{chauf.numero_permis}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Catégories autorisées :</span>
                    <div className="flex gap-1">
                      {chauf.categories_permis.map(cat => (
                        <span key={cat} className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold text-[10px]">
                          Permis {cat}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Expiration :</span>
                    <span className="text-slate-300 font-mono text-[11px]">{chauf.date_expiration_permis}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-slate-400">Trajets effectués :</span>
                    <span className="font-semibold text-emerald-400">{chauf.historique_trajets_count || 0} rotations</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end">
                <button
                  onClick={() => {
                    setFormChauf(chauf)
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

      {/* ── Modale Conducteur ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">
              {formChauf.id ? 'Modifier Conducteur' : 'Nouveau Conducteur'}
            </h3>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Nom de famille *</label>
                  <input
                    type="text"
                    required
                    value={formChauf.nom}
                    onChange={e => setFormChauf({ ...formChauf, nom: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Prénom(s) *</label>
                  <input
                    type="text"
                    required
                    value={formChauf.prenom}
                    onChange={e => setFormChauf({ ...formChauf, prenom: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Téléphone *</label>
                  <input
                    type="text"
                    required
                    value={formChauf.telephone}
                    onChange={e => setFormChauf({ ...formChauf, telephone: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Agence de rattachement</label>
                  <input
                    type="text"
                    value={formChauf.agence}
                    onChange={e => setFormChauf({ ...formChauf, agence: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Numéro de Permis *</label>
                  <input
                    type="text"
                    required
                    value={formChauf.numero_permis}
                    onChange={e => setFormChauf({ ...formChauf, numero_permis: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Date d'expiration</label>
                  <input
                    type="date"
                    required
                    value={formChauf.date_expiration_permis}
                    onChange={e => setFormChauf({ ...formChauf, date_expiration_permis: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-medium">Statut</label>
                <select
                  value={formChauf.statut}
                  onChange={e => setFormChauf({ ...formChauf, statut: e.target.value as any })}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                >
                  <option value="DISPONIBLE">Disponible</option>
                  <option value="EN_MISSION">En Mission</option>
                  <option value="REPOS">Repos</option>
                  <option value="CONGE">Congé</option>
                  <option value="SUSPENDU">Suspendu</option>
                </select>
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

export default TransportChauffeursPage
