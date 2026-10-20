import React, { useState, useEffect } from 'react'
import {
  Package,
  Plus,
  Search,
  Printer,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  ArrowRight,
  User,
  DollarSign,
  Scale
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  transportService,
  TransportColis
} from '../../../services/transportService'

export const TransportColisPage: React.FC = () => {
  const { companyId: ctxCompanyId, sectorSlug, company } = useTenant()
  const companyId = ctxCompanyId || 'demo-company'
  const tenant = company

  const [colisList, setColisList] = useState<TransportColis[]>([])
  const [search, setSearch] = useState('')
  const [filterStatut, setFilterStatut] = useState<string>('TOUS')
  const [colisImprime, setColisImprime] = useState<TransportColis | null>(null)
  const [loading, setLoading] = useState(true)

  // Modale nouveau colis
  const [showModal, setShowModal] = useState(false)
  const [formColis, setFormColis] = useState({
    expediteur_nom: '',
    expediteur_telephone: '',
    destinataire_nom: '',
    destinataire_telephone: '',
    agence_depot: 'Cotonou (Étoile Rouge)',
    agence_retrait: 'Parakou (Gare Centrale)',
    nature_colis: 'Effets personnels & Vêtements',
    nombre_colis: 1,
    poids_kg: 5,
    valeur_declaree: 25000,
    frais_transport: 2500,
    instructions: '',
  })

  const loadColis = async () => {
    setLoading(true)
    try {
      const data = await transportService.fetchTransportColis(companyId)
      setColisList(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadColis()
  }, [companyId])

  const handleCalculerTarif = (poids: number, nature: string) => {
    const tarif = transportService.calculerTarifColis(poids, nature)
    setFormColis(prev => ({ ...prev, poids_kg: poids, nature_colis: nature, frais_transport: tarif }))
  }

  const handleEnregistrerColis = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await transportService.enregistrerColis(companyId, formColis)
      if (res.success && res.colis) {
        setColisImprime(res.colis)
        setShowModal(false)
        setFormColis({
          expediteur_nom: '',
          expediteur_telephone: '',
          destinataire_nom: '',
          destinataire_telephone: '',
          agence_depot: 'Cotonou (Étoile Rouge)',
          agence_retrait: 'Parakou (Gare Centrale)',
          nature_colis: 'Effets personnels & Vêtements',
          nombre_colis: 1,
          poids_kg: 5,
          valeur_declaree: 25000,
          frais_transport: 2500,
          instructions: '',
        })
        await loadColis()
      }
    } catch (e) {
      alert('Erreur enregistrement colis')
    }
  }

  const filtered = colisList.filter(c => {
    const matchSearch =
      c.code_suivi.toLowerCase().includes(search.toLowerCase()) ||
      c.expediteur_nom.toLowerCase().includes(search.toLowerCase()) ||
      c.destinataire_nom.toLowerCase().includes(search.toLowerCase()) ||
      c.destinataire_telephone.includes(search)
    const matchStatut = filterStatut === 'TOUS' || c.statut === filterStatut
    return matchSearch && matchStatut
  })

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 bg-slate-950 text-slate-100 min-h-screen">
      {/* ── En-tête ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Colis, Courrier & Expéditions
              </h1>
              <p className="text-sm text-slate-400">
                Dépôt de colis, tarification au poids, génération de numéro de suivi et bordereaux d'expédition
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setColisImprime(null)
            setShowModal(true)
          }}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-lg shadow-emerald-600/20 transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Enregistrer un Colis
        </button>
      </div>

      {/* ── Filtres & Recherche ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {['TOUS', 'ENREGISTRE', 'CHARGE', 'EN_TRANSIT', 'DISPONIBLE_RETRAIT', 'LIVRE', 'INCIDENT'].map(st => (
            <button
              key={st}
              onClick={() => setFilterStatut(st)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                filterStatut === st
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Code de suivi TRK-..., nom, tél..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* ── Bordereau d'expédition à imprimer si émis ── */}
      {colisImprime && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-emerald-500/40 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-base">
              <CheckCircle2 className="w-5 h-5" />
              Bordereau Colis Enregistré avec Succès
            </div>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow transition"
            >
              <Printer className="w-4 h-4" /> Imprimer Bordereau
            </button>
          </div>

          <div className="max-w-md mx-auto p-6 rounded-2xl bg-white text-slate-900 shadow-2xl font-mono text-xs space-y-3 border border-slate-300">
            <div className="text-center border-b border-slate-300 pb-2">
              <h4 className="font-black text-sm uppercase tracking-wider">{tenant?.name || 'SERVICE COLIS GESTIO229'}</h4>
              <p className="text-[10px] text-slate-600">Bordereau de Dépôt & Récépissé d'Expédition</p>
            </div>

            <div className="flex justify-between text-sm font-black text-blue-600 bg-blue-50 p-2 rounded">
              <span>CODE SUIVI :</span>
              <span>{colisImprime.code_suivi}</span>
            </div>

            <div className="flex justify-between text-[11px]">
              <span>EXPÉDITEUR :</span>
              <strong>{colisImprime.expediteur_nom} ({colisImprime.expediteur_telephone})</strong>
            </div>

            <div className="flex justify-between text-[11px]">
              <span>DESTINATAIRE :</span>
              <strong>{colisImprime.destinataire_nom} ({colisImprime.destinataire_telephone})</strong>
            </div>

            <div className="flex justify-between text-[11px]">
              <span>TRAJET :</span>
              <strong>{colisImprime.agence_depot} ➔ {colisImprime.agence_retrait}</strong>
            </div>

            <div className="flex justify-between text-[11px]">
              <span>NATURE & POIDS :</span>
              <strong>{colisImprime.nature_colis} ({colisImprime.poids_kg} kg)</strong>
            </div>

            <div className="flex justify-between text-sm font-black border-t border-b border-slate-300 py-2">
              <span>FRAIS TRANSPORT :</span>
              <span>{colisImprime.frais_transport.toLocaleString('fr-FR')} FCFA</span>
            </div>

            <div className="text-center pt-2">
              <QrCode className="w-16 h-16 text-slate-900 mx-auto" />
              <p className="text-[9px] text-slate-500 mt-2">
                Le destinataire doit présenter sa pièce d'identité et le code de suivi pour le retrait.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Tableau des Colis ── */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800">
                <th className="pb-3 font-semibold">Code Suivi</th>
                <th className="pb-3 font-semibold">Expéditeur</th>
                <th className="pb-3 font-semibold">Destinataire</th>
                <th className="pb-3 font-semibold">Gare Dépôt ➔ Retrait</th>
                <th className="pb-3 font-semibold">Poids / Colis</th>
                <th className="pb-3 font-semibold">Frais</th>
                <th className="pb-3 font-semibold">Statut</th>
                <th className="pb-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Aucun colis enregistré pour le moment.
                  </td>
                </tr>
              ) : (
                filtered.map(c => (
                  <tr key={c.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 font-mono font-bold text-blue-400">{c.code_suivi}</td>
                    <td className="py-3 font-medium text-white">{c.expediteur_nom}<br/><span className="text-[10px] text-slate-400">{c.expediteur_telephone}</span></td>
                    <td className="py-3 text-slate-200">{c.destinataire_nom}<br/><span className="text-[10px] text-slate-400">{c.destinataire_telephone}</span></td>
                    <td className="py-3 text-slate-300">{c.agence_depot} ➔ {c.agence_retrait}</td>
                    <td className="py-3 text-slate-300">{c.poids_kg} kg ({c.nombre_colis} colis)</td>
                    <td className="py-3 font-bold text-emerald-400">{c.frais_transport.toLocaleString('fr-FR')} F</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                        c.statut === 'LIVRE' ? 'bg-emerald-500/20 text-emerald-400' :
                        c.statut === 'DISPONIBLE_RETRAIT' ? 'bg-amber-500/20 text-amber-400' :
                        c.statut === 'CHARGE' || c.statut === 'EN_TRANSIT' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {c.statut}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => setColisImprime(c)}
                        className="px-2.5 py-1 text-xs text-blue-400 hover:bg-blue-500/10 rounded border border-blue-500/20 transition"
                      >
                        Voir Bordereau
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modale Enregistrement Colis ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Package className="w-5 h-5 text-emerald-400" />
              Nouveau Dépôt de Colis / Fret
            </h3>

            <form onSubmit={handleEnregistrerColis} className="space-y-4 text-xs">
              {/* Expéditeur & Destinataire */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="font-semibold text-slate-300 text-xs flex items-center gap-1.5">
                  <User className="w-4 h-4 text-blue-400" /> Coordonnées Expéditeur & Destinataire
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400">Nom Expéditeur *</label>
                    <input
                      type="text"
                      required
                      placeholder="Nom de l'envoyeur"
                      value={formColis.expediteur_nom}
                      onChange={e => setFormColis({ ...formColis, expediteur_nom: e.target.value })}
                      className="w-full mt-1 p-2 bg-slate-900 border border-slate-800 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400">Tél. Expéditeur *</label>
                    <input
                      type="tel"
                      required
                      placeholder="+229 ..."
                      value={formColis.expediteur_telephone}
                      onChange={e => setFormColis({ ...formColis, expediteur_telephone: e.target.value })}
                      className="w-full mt-1 p-2 bg-slate-900 border border-slate-800 rounded-lg text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400">Nom Destinataire *</label>
                    <input
                      type="text"
                      required
                      placeholder="Nom du récepteur"
                      value={formColis.destinataire_nom}
                      onChange={e => setFormColis({ ...formColis, destinataire_nom: e.target.value })}
                      className="w-full mt-1 p-2 bg-slate-900 border border-slate-800 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400">Tél. Destinataire *</label>
                    <input
                      type="tel"
                      required
                      placeholder="+229 ..."
                      value={formColis.destinataire_telephone}
                      onChange={e => setFormColis({ ...formColis, destinataire_telephone: e.target.value })}
                      className="w-full mt-1 p-2 bg-slate-900 border border-slate-800 rounded-lg text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Agences Dépôt et Retrait */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Agence de Dépôt *</label>
                  <input
                    type="text"
                    required
                    value={formColis.agence_depot}
                    onChange={e => setFormColis({ ...formColis, agence_depot: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Agence de Retrait *</label>
                  <input
                    type="text"
                    required
                    value={formColis.agence_retrait}
                    onChange={e => setFormColis({ ...formColis, agence_retrait: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              {/* Détails du Colis */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Nature du Colis *</label>
                  <input
                    type="text"
                    required
                    value={formColis.nature_colis}
                    onChange={e => handleCalculerTarif(formColis.poids_kg, e.target.value)}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Poids (kg) *</label>
                  <input
                    type="number"
                    step={0.5}
                    value={formColis.poids_kg}
                    onChange={e => handleCalculerTarif(Number(e.target.value), formColis.nature_colis)}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Frais Transport (FCFA) *</label>
                  <input
                    type="number"
                    step={100}
                    value={formColis.frais_transport}
                    onChange={e => setFormColis({ ...formColis, frais_transport: Number(e.target.value) })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-emerald-400 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-medium">Instructions particulières / Remarques</label>
                <textarea
                  value={formColis.instructions}
                  onChange={e => setFormColis({ ...formColis, instructions: e.target.value })}
                  placeholder="ex: Fragile, ne pas poser d'objet lourd dessus..."
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white h-16"
                />
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
                  className="px-4 py-2 font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg"
                >
                  Enregistrer & Émettre Bordereau
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default TransportColisPage
