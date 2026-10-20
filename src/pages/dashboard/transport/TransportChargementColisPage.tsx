import React, { useState, useEffect } from 'react'
import {
  Package,
  Bus,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldCheck,
  Search,
  Check,
  UserCheck,
  AlertTriangle
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  transportService,
  TransportColis,
  TransportDepart
} from '../../../services/transportService'

export const TransportChargementColisPage: React.FC = () => {
  const { companyId: ctxCompanyId, sectorSlug, company, user } = useTenant()
  const companyId = ctxCompanyId || 'demo-company'
  const tenant = company
  const agentNom = (user as any)?.name || 'Agent Escale'

  const [colisList, setColisList] = useState<TransportColis[]>([])
  const [departs, setDeparts] = useState<TransportDepart[]>([])
  const [selectedDepartId, setSelectedDepartId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  // Modale de remise au destinataire
  const [showModalRemise, setShowModalRemise] = useState(false)
  const [colisARemettre, setColisARemettre] = useState<TransportColis | null>(null)
  const [pieceIdDestinataire, setPieceIdDestinataire] = useState('')

  const loadData = async () => {
    setLoading(true)
    try {
      const [allColis, allDeparts] = await Promise.all([
        transportService.fetchTransportColis(companyId),
        transportService.fetchTransportDeparts(companyId)
      ])
      setColisList(allColis)
      setDeparts(allDeparts)
      if (allDeparts.length > 0 && !selectedDepartId) {
        setSelectedDepartId(allDeparts[0].id)
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

  // Colis en attente de chargement
  const colisEnAttente = colisList.filter(c => c.statut === 'ENREGISTRE' || c.statut === 'EN_ATTENTE_CHARGEMENT')

  // Colis affectés au départ sélectionné
  const colisDuDepart = colisList.filter(c => c.depart_id === selectedDepartId)

  // Colis prêts pour retrait en agence
  const colisPretsRetrait = colisList.filter(c => c.statut === 'DISPONIBLE_RETRAIT')

  const handleAffecterColis = async (colisId: string) => {
    if (!selectedDepartId) {
      alert('Veuillez sélectionner un départ de bus')
      return
    }
    try {
      await transportService.affecterColisAuDepart(companyId, colisId, selectedDepartId)
      await loadData()
    } catch (e) {
      alert('Erreur affectation colis')
    }
  }

  const handleMarquerArrivee = async (colisId: string) => {
    try {
      await transportService.marquerColisArriveAgence(companyId, colisId)
      await loadData()
    } catch (e) {
      alert('Erreur validation arrivée')
    }
  }

  const handleConfirmerRemise = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!colisARemettre) return

    try {
      await transportService.confirmerRemiseColisDestinataire(companyId, colisARemettre.id, {
        destinatairePieceId: pieceIdDestinataire,
        agentRemise: agentNom,
        signatureOuPreuve: 'Vérification physique CNI/CIP au guichet'
      })
      setShowModalRemise(false)
      setColisARemettre(null)
      setPieceIdDestinataire('')
      await loadData()
    } catch (e) {
      alert('Erreur remise colis')
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 bg-slate-950 text-slate-100 min-h-screen">
      {/* ── En-tête ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Chargement, Déchargement & Remise des Colis
              </h1>
              <p className="text-sm text-slate-400">
                Manifeste de soute, chargement dans les bus, escales et remise sécurisée aux destinataires
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 1 : Chargement des Colis dans un Bus au départ ── */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
          <div className="flex items-center gap-2">
            <Bus className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold text-white">Affectation & Chargement en Soute</h2>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">Départ de Bus :</span>
            <select
              value={selectedDepartId}
              onChange={e => setSelectedDepartId(e.target.value)}
              className="p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
            >
              {departs.map(d => (
                <option key={d.id} value={d.id}>
                  {d.heure_depart} — {d.ligne_nom} (Bus {d.bus_immatriculation})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Colis en attente de chargement */}
          <div className="space-y-3">
            <h3 className="font-semibold text-xs text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Colis en attente à la gare ({colisEnAttente.length})</span>
            </h3>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {colisEnAttente.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-slate-800">
                  Aucun colis en attente de chargement.
                </div>
              ) : (
                colisEnAttente.map(c => (
                  <div key={c.id} className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-mono font-bold text-blue-400">{c.code_suivi}</div>
                      <div className="text-white font-medium">{c.nature_colis} ({c.poids_kg} kg)</div>
                      <div className="text-[11px] text-slate-400">Destination : {c.agence_retrait}</div>
                    </div>
                    <button
                      onClick={() => handleAffecterColis(c.id)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow transition flex items-center gap-1"
                    >
                      Charger <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Manifeste de soute du bus sélectionné */}
          <div className="space-y-3">
            <h3 className="font-semibold text-xs text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Colis chargés dans ce bus ({colisDuDepart.length})</span>
            </h3>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {colisDuDepart.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-slate-800">
                  Aucun colis chargé dans ce départ pour le moment.
                </div>
              ) : (
                colisDuDepart.map(c => (
                  <div key={c.id} className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-mono font-bold text-emerald-400">{c.code_suivi}</div>
                      <div className="text-white font-medium">{c.nature_colis} ({c.poids_kg} kg)</div>
                      <div className="text-[11px] text-slate-400">Pour : {c.destinataire_nom} ({c.destinataire_telephone})</div>
                    </div>
                    {c.statut !== 'DISPONIBLE_RETRAIT' && c.statut !== 'LIVRE' && (
                      <button
                        onClick={() => handleMarquerArrivee(c.id)}
                        className="px-2.5 py-1 text-xs font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition"
                      >
                        Décharger à l'arrivée
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 2 : Guichet de Remise Sécurisée au Destinataire ── */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">
              Colis Arrivés à Destination & Prêts pour Retrait ({colisPretsRetrait.length})
            </h2>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800">
                <th className="pb-3 font-semibold">Code Suivi</th>
                <th className="pb-3 font-semibold">Destinataire</th>
                <th className="pb-3 font-semibold">Téléphone</th>
                <th className="pb-3 font-semibold">Nature du Colis</th>
                <th className="pb-3 font-semibold">Agence de Retrait</th>
                <th className="pb-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {colisPretsRetrait.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Aucun colis en attente de retrait par le destinataire.
                  </td>
                </tr>
              ) : (
                colisPretsRetrait.map(c => (
                  <tr key={c.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 font-mono font-bold text-blue-400">{c.code_suivi}</td>
                    <td className="py-3 font-semibold text-white">{c.destinataire_nom}</td>
                    <td className="py-3 font-mono text-slate-300">{c.destinataire_telephone}</td>
                    <td className="py-3 text-slate-300">{c.nature_colis} ({c.poids_kg} kg)</td>
                    <td className="py-3 text-slate-400">{c.agence_retrait}</td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => {
                          setColisARemettre(c)
                          setPieceIdDestinataire('')
                          setShowModalRemise(true)
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow transition"
                      >
                        Valider Remise
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modale Confirmation de Remise ── */}
      {showModalRemise && colisARemettre && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Remise de Colis au Destinataire
            </h3>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
              <div>Code Suivi : <strong className="font-mono text-blue-400">{colisARemettre.code_suivi}</strong></div>
              <div>Destinataire attendu : <strong className="text-white">{colisARemettre.destinataire_nom}</strong></div>
              <div>Téléphone : <strong className="text-white">{colisARemettre.destinataire_telephone}</strong></div>
            </div>

            <form onSubmit={handleConfirmerRemise} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-medium">Numéro de Pièce d'Identité du Destinataire *</label>
                <input
                  type="text"
                  required
                  placeholder="CNI, CIP ou Passeport"
                  value={pieceIdDestinataire}
                  onChange={e => setPieceIdDestinataire(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
                />
              </div>

              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>L'agent {agentNom} certifie avoir vérifié l'identité du récepteur.</span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModalRemise(false)}
                  className="px-4 py-2 text-slate-300 hover:bg-slate-800 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow"
                >
                  Confirmer la Remise
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default TransportChargementColisPage
