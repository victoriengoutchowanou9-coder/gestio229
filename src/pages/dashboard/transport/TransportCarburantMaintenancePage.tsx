import React, { useState, useEffect } from 'react'
import {
  Fuel,
  Wrench,
  Plus,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Gauge,
  Bus
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  transportService,
  TransportCarburantLog,
  TransportMaintenanceLog,
  TransportBus
} from '../../../services/transportService'

export const TransportCarburantMaintenancePage: React.FC = () => {
  const { companyId: ctxCompanyId, sectorSlug, company } = useTenant()
  const companyId = ctxCompanyId || 'demo-company'
  const tenant = company

  const [activeTab, setActiveTab] = useState<'CARBURANT' | 'MAINTENANCE'>('CARBURANT')
  const [carburantLogs, setCarburantLogs] = useState<TransportCarburantLog[]>([])
  const [maintenanceLogs, setMaintenanceLogs] = useState<TransportMaintenanceLog[]>([])
  const [busList, setBusList] = useState<TransportBus[]>([])
  const [loading, setLoading] = useState(true)

  // Modale Carburant
  const [showModalCarb, setShowModalCarb] = useState(false)
  const [formCarb, setFormCarb] = useState({
    bus_id: '',
    immatriculation: '',
    date: new Date().toISOString().slice(0, 10),
    kilometrage: 120500,
    quantite_litres: 150,
    prix_litre: 700,
    cout_total: 105000,
    fournisseur_station: 'Bénin Pétro Cotonou',
    plein_complet: true,
  })

  // Modale Maintenance
  const [showModalMaint, setShowModalMaint] = useState(false)
  const [formMaint, setFormMaint] = useState<{
    bus_id: string
    immatriculation: string
    date_debut: string
    type_intervention: TransportMaintenanceLog['type_intervention']
    description: string
    garage_prestataire: string
    cout_pieces: number
    cout_main_oeuvre: number
    cout_total: number
    immobilise_le_bus: boolean
    statut: TransportMaintenanceLog['statut']
  }>({
    bus_id: '',
    immatriculation: '',
    date_debut: new Date().toISOString().slice(0, 10),
    type_intervention: 'VIDANGE_PREVENTIVE',
    description: 'Vidange huile moteur 15W40 + remplacement filtres',
    garage_prestataire: 'Garage Central Flotte',
    cout_pieces: 65000,
    cout_main_oeuvre: 25000,
    cout_total: 90000,
    immobilise_le_bus: false,
    statut: 'EN_COURS',
  })

  const loadData = async () => {
    setLoading(true)
    try {
      const [carb, maint, buses] = await Promise.all([
        transportService.fetchCarburantLogs(companyId),
        transportService.fetchMaintenanceLogs(companyId),
        transportService.fetchTransportBus(companyId)
      ])
      setCarburantLogs(carb)
      setMaintenanceLogs(maint)
      setBusList(buses)

      if (buses.length > 0) {
        if (!formCarb.bus_id) {
          setFormCarb(prev => ({ ...prev, bus_id: buses[0].id, immatriculation: buses[0].immatriculation }))
        }
        if (!formMaint.bus_id) {
          setFormMaint(prev => ({ ...prev, bus_id: buses[0].id, immatriculation: buses[0].immatriculation }))
        }
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

  const handleSaveCarburant = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await transportService.enregistrerPleinCarburant(companyId, formCarb)
      setShowModalCarb(false)
      await loadData()
    } catch (e) {
      alert('Erreur enregistrement carburant')
    }
  }

  const handleSaveMaintenance = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await transportService.enregistrerInterventionMaintenance(companyId, formMaint)
      setShowModalMaint(false)
      await loadData()
    } catch (e) {
      alert('Erreur enregistrement maintenance')
    }
  }

  const handleCloturerMaintenance = async (maintId: string) => {
    try {
      await transportService.cloturerInterventionMaintenance(companyId, maintId)
      await loadData()
    } catch (e) {
      alert('Erreur clôture')
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 bg-slate-950 text-slate-100 min-h-screen">
      {/* ── En-tête ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <Fuel className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Carburant, Consommation & Maintenance de Flotte
              </h1>
              <p className="text-sm text-slate-400">
                Gestion des pleins de gasoil, suivi des interventions garage et immobilisations
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {activeTab === 'CARBURANT' ? (
            <button
              onClick={() => setShowModalCarb(true)}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow transition"
            >
              <Plus className="w-4 h-4" /> Enregistrer Plein
            </button>
          ) : (
            <button
              onClick={() => setShowModalMaint(true)}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-lg shadow transition"
            >
              <Plus className="w-4 h-4" /> Nouvelle Intervention
            </button>
          )}
        </div>
      </div>

      {/* ── Onglets ── */}
      <div className="flex border-b border-slate-800 gap-4 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('CARBURANT')}
          className={`pb-3 flex items-center gap-2 transition border-b-2 ${
            activeTab === 'CARBURANT'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Fuel className="w-4 h-4" /> Carburant & Consommation ({carburantLogs.length})
        </button>
        <button
          onClick={() => setActiveTab('MAINTENANCE')}
          className={`pb-3 flex items-center gap-2 transition border-b-2 ${
            activeTab === 'MAINTENANCE'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Wrench className="w-4 h-4" /> Entretien & Réparations ({maintenanceLogs.length})
        </button>
      </div>

      {/* ── Contenu Onglet 1 : Carburant ── */}
      {activeTab === 'CARBURANT' && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-sm space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="pb-3 font-semibold">Date</th>
                  <th className="pb-3 font-semibold">Bus</th>
                  <th className="pb-3 font-semibold">Kilométrage</th>
                  <th className="pb-3 font-semibold">Volume (Litres)</th>
                  <th className="pb-3 font-semibold">Prix / L</th>
                  <th className="pb-3 font-semibold">Coût Total</th>
                  <th className="pb-3 font-semibold">Fournisseur / Station</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {carburantLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Aucun plein enregistré pour le moment.
                    </td>
                  </tr>
                ) : (
                  carburantLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 text-slate-300 font-mono">{log.date}</td>
                      <td className="py-3 font-mono font-bold text-white">{log.immatriculation}</td>
                      <td className="py-3 text-slate-300 font-mono">{log.kilometrage.toLocaleString('fr-FR')} km</td>
                      <td className="py-3 font-bold text-blue-400">{log.quantite_litres} L</td>
                      <td className="py-3 text-slate-400">{log.prix_litre} F</td>
                      <td className="py-3 font-bold text-emerald-400">{log.cout_total.toLocaleString('fr-FR')} F</td>
                      <td className="py-3 text-slate-400">{log.fournisseur_station || 'Station interne'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Contenu Onglet 2 : Maintenance ── */}
      {activeTab === 'MAINTENANCE' && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-sm space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="pb-3 font-semibold">Date</th>
                  <th className="pb-3 font-semibold">Bus</th>
                  <th className="pb-3 font-semibold">Type Intervention</th>
                  <th className="pb-3 font-semibold">Description</th>
                  <th className="pb-3 font-semibold">Garage</th>
                  <th className="pb-3 font-semibold">Coût Total</th>
                  <th className="pb-3 font-semibold">Statut</th>
                  <th className="pb-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {maintenanceLogs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      Aucune intervention de maintenance enregistrée.
                    </td>
                  </tr>
                ) : (
                  maintenanceLogs.map(m => (
                    <tr key={m.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 text-slate-300 font-mono">{m.date_debut}</td>
                      <td className="py-3 font-mono font-bold text-white">{m.immatriculation}</td>
                      <td className="py-3 font-semibold text-amber-400">{m.type_intervention}</td>
                      <td className="py-3 text-slate-300">{m.description}</td>
                      <td className="py-3 text-slate-400">{m.garage_prestataire}</td>
                      <td className="py-3 font-bold text-emerald-400">{m.cout_total.toLocaleString('fr-FR')} F</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                          m.statut === 'TERMINE' ? 'bg-emerald-500/20 text-emerald-400' :
                          'bg-amber-500/20 text-amber-400'
                        }`}>
                          {m.statut}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        {m.statut !== 'TERMINE' && (
                          <button
                            onClick={() => handleCloturerMaintenance(m.id)}
                            className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded transition"
                          >
                            Clôturer & Libérer Bus
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modale Carburant ── */}
      {showModalCarb && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Fuel className="w-5 h-5 text-blue-400" /> Enregistrer un Plein de Carburant
            </h3>

            <form onSubmit={handleSaveCarburant} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-medium">Bus *</label>
                <select
                  value={formCarb.bus_id}
                  onChange={e => {
                    const b = busList.find(item => item.id === e.target.value)
                    setFormCarb({ ...formCarb, bus_id: e.target.value, immatriculation: b ? b.immatriculation : '' })
                  }}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                >
                  {busList.map(b => (
                    <option key={b.id} value={b.id}>{b.immatriculation} ({b.marque})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Date *</label>
                  <input
                    type="date"
                    required
                    value={formCarb.date}
                    onChange={e => setFormCarb({ ...formCarb, date: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Kilométrage relevé *</label>
                  <input
                    type="number"
                    required
                    value={formCarb.kilometrage}
                    onChange={e => setFormCarb({ ...formCarb, kilometrage: Number(e.target.value) })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Quantité (Litres) *</label>
                  <input
                    type="number"
                    required
                    value={formCarb.quantite_litres}
                    onChange={e => {
                      const qte = Number(e.target.value)
                      setFormCarb({ ...formCarb, quantite_litres: qte, cout_total: qte * formCarb.prix_litre })
                    }}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Prix au Litre (FCFA) *</label>
                  <input
                    type="number"
                    required
                    value={formCarb.prix_litre}
                    onChange={e => {
                      const pu = Number(e.target.value)
                      setFormCarb({ ...formCarb, prix_litre: pu, cout_total: formCarb.quantite_litres * pu })
                    }}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-medium">Coût Total (FCFA)</label>
                <input
                  type="number"
                  value={formCarb.cout_total}
                  readOnly
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-emerald-400 font-bold"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium">Fournisseur / Station-Service</label>
                <input
                  type="text"
                  value={formCarb.fournisseur_station}
                  onChange={e => setFormCarb({ ...formCarb, fournisseur_station: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModalCarb(false)}
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

      {/* ── Modale Maintenance ── */}
      {showModalMaint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Wrench className="w-5 h-5 text-amber-400" /> Déclarer une Intervention Maintenance
            </h3>

            <form onSubmit={handleSaveMaintenance} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-medium">Bus *</label>
                <select
                  value={formMaint.bus_id}
                  onChange={e => {
                    const b = busList.find(item => item.id === e.target.value)
                    setFormMaint({ ...formMaint, bus_id: e.target.value, immatriculation: b ? b.immatriculation : '' })
                  }}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                >
                  {busList.map(b => (
                    <option key={b.id} value={b.id}>{b.immatriculation} ({b.marque})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Type d'intervention *</label>
                  <select
                    value={formMaint.type_intervention}
                    onChange={e => setFormMaint({ ...formMaint, type_intervention: e.target.value as any })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  >
                    <option value="VIDANGE_PREVENTIVE">Vidange Préventive</option>
                    <option value="PNEUMATIQUE">Pneumatique</option>
                    <option value="FREINAGE">Freinage</option>
                    <option value="MOTEUR">Moteur</option>
                    <option value="CLIMATISATION">Climatisation</option>
                    <option value="CARROSSERIE">Carrosserie</option>
                    <option value="VISITE_TECHNIQUE">Visite Technique</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Date de début *</label>
                  <input
                    type="date"
                    required
                    value={formMaint.date_debut}
                    onChange={e => setFormMaint({ ...formMaint, date_debut: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-medium">Description des travaux *</label>
                <input
                  type="text"
                  required
                  value={formMaint.description}
                  onChange={e => setFormMaint({ ...formMaint, description: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Garage Prestataire</label>
                  <input
                    type="text"
                    value={formMaint.garage_prestataire}
                    onChange={e => setFormMaint({ ...formMaint, garage_prestataire: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Coût Total (FCFA)</label>
                  <input
                    type="number"
                    value={formMaint.cout_total}
                    onChange={e => setFormMaint({ ...formMaint, cout_total: Number(e.target.value) })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-emerald-400 font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="checkImmob"
                  checked={formMaint.immobilise_le_bus}
                  onChange={e => setFormMaint({ ...formMaint, immobilise_le_bus: e.target.checked })}
                  className="rounded border-slate-700 text-amber-500 focus:ring-0"
                />
                <label htmlFor="checkImmob" className="text-xs text-amber-400 font-medium cursor-pointer">
                  Immobiliser le bus (interdire l'affectation à un départ pendant les travaux)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModalMaint(false)}
                  className="px-4 py-2 text-slate-300 hover:bg-slate-800 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-lg"
                >
                  Enregistrer l'Intervention
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default TransportCarburantMaintenancePage
