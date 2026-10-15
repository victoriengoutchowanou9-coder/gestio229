// =============================================================================
// GESTIO 229 SaaS — Traceurs & Ingestion GPS Flotte (Protocoles IoT)
// Compatibilité Teltonika FMB920, Concox, Coban, gestion des IMEI, SIM & Simulateur
// =============================================================================

import React, { useEffect, useState } from 'react'
import {
  Radio,
  Plus,
  Play,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Cpu,
  Wifi,
  Terminal,
  X,
  Save,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  getBalisesFlotte,
  saveBaliseFlotte,
  getVehiculesFlotte,
  simulerAvanceeVehicule,
  type FlotteBalise,
  type FlotteVehicule,
} from '../../../services/flotteService'

export const FlotteIntegrationsGpsPage: React.FC = () => {
  const { company } = useTenant()
  const companyId = company?.id || ''

  const [balises, setBalises] = useState<FlotteBalise[]>([])
  const [vehicules, setVehicules] = useState<FlotteVehicule[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [modalOpen, setModalOpen] = useState<boolean>(false)
  const [editingBalise, setEditingBalise] = useState<Partial<FlotteBalise>>({})
  const [saving, setSaving] = useState<boolean>(false)
  const [testLog, setTestLog] = useState<string>('')
  const [testingPacket, setTestingPacket] = useState<boolean>(false)

  const loadData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [bList, vList] = await Promise.all([
        getBalisesFlotte(companyId),
        getVehiculesFlotte(companyId),
      ])
      setBalises(bList)
      setVehicules(vList)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [companyId])

  const handleOpenAdd = () => {
    const randomImei = `86290404${Math.floor(1000000 + Math.random() * 9000000)}`
    setEditingBalise({
      imei: randomImei,
      modele: 'Teltonika FMB920 (BLE / 2G Micro-SIM)',
      numero_sim: '+229 97 ',
      operateur_sim: 'MTN BENIN M2M',
      statut: 'EN_LIGNE',
      niveau_batterie_pct: 100,
      firmware_version: '03.28.02.Rev.01',
    })
    setModalOpen(true)
  }

  const handleSimulerTrame = async () => {
    if (!companyId || balises.length === 0) return
    setTestingPacket(true)
    const target = balises[0]
    setTestLog(`[SIMULATEUR AVL] Connexion TCP au serveur télématique port 5027...
[SIMULATEUR AVL] Envoi trame IMEI: ${target.imei}
[SIMULATEUR AVL] Encodage protocole Codec 8 / Teltonika FMB920...
[SIMULATEUR AVL] Latitude: 6.365400 N | Longitude: 2.418300 E | Vitesse: 42 km/h
[SIMULATEUR AVL] Contact allumé (DIN1=1) | Tension alimentation: 12.8V
[SIMULATEUR AVL] Réponse ACK serveur: 0x00000001 (Succès)`)

    try {
      if (vehicules.length > 0) {
        await simulerAvanceeVehicule(companyId, vehicules[0].id, 0.4)
      }
    } finally {
      setTestingPacket(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingBalise.imei) return
    setSaving(true)
    try {
      const saved = await saveBaliseFlotte(companyId, editingBalise)
      setBalises((prev) => [saved, ...prev.filter((b) => b.id !== saved.id)])
      setModalOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Radio className="w-6 h-6 text-sky-600" />
            <span>Traceurs GPS, Balises IoT & Ingestion</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Gestion du parc de boîtiers télématiques (Teltonika, Concox, Coban), SIM M2M et simulateur de trames
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSimulerTrame}
            disabled={testingPacket}
            className="flex items-center space-x-1.5 px-3.5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-semibold shadow transition-all active:scale-95 disabled:opacity-60"
          >
            <Play className={`w-3.5 h-3.5 ${testingPacket ? 'animate-spin' : ''}`} />
            <span>Simuler Trame Teltonika</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="flex items-center space-x-1.5 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold shadow transition-colors active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Nouvelle Balise</span>
          </button>
        </div>
      </div>

      {/* Console de test de trame Teltonika si active */}
      {testLog && (
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs font-mono text-emerald-400 space-y-2 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>Console d'Ingestion Télématique — Port 5027</span>
            </div>
            <button onClick={() => setTestLog('')} className="text-slate-500 hover:text-white">
              Fermer
            </button>
          </div>
          <pre className="whitespace-pre-wrap leading-relaxed">{testLog}</pre>
        </div>
      )}

      {/* Tableau des Balises */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b text-slate-500 uppercase font-semibold">
                <th className="py-3 px-4">Numéro IMEI</th>
                <th className="py-3 px-4">Modèle Boîtier</th>
                <th className="py-3 px-4">Véhicule Associé</th>
                <th className="py-3 px-4">Carte SIM & Réseau</th>
                <th className="py-3 px-4">Batterie Interne</th>
                <th className="py-3 px-4">Statut Connexion</th>
                <th className="py-3 px-4">Firmware</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {balises.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-mono font-bold text-sky-600 dark:text-sky-400">
                    {b.imei}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                    {b.modele}
                  </td>
                  <td className="py-3 px-4">
                    {b.vehicule_immat ? (
                      <span className="font-bold text-slate-900 dark:text-white">
                        {b.vehicule_immat}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">Non affecté</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div>{b.numero_sim || '—'}</div>
                    <div className="text-[10px] text-slate-500">{b.operateur_sim}</div>
                  </td>
                  <td className="py-3 px-4 font-semibold">
                    <span
                      className={
                        b.niveau_batterie_pct < 30 ? 'text-rose-500 font-bold' : 'text-emerald-600'
                      }
                    >
                      {b.niveau_batterie_pct}%
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                        b.statut === 'EN_LIGNE'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {b.statut}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                    {b.firmware_version}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Ajout Balise */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border p-5 max-w-md w-full space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Déclarer un Boîtier GPS / Balise
              </h2>
              <button onClick={() => setModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block font-semibold mb-1">Numéro IMEI *</label>
                <input
                  type="text"
                  required
                  placeholder="862904041289401"
                  value={editingBalise.imei || ''}
                  onChange={(e) => setEditingBalise({ ...editingBalise, imei: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Modèle du Traceur</label>
                <input
                  type="text"
                  value={editingBalise.modele || 'Teltonika FMB920'}
                  onChange={(e) => setEditingBalise({ ...editingBalise, modele: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">N° Carte SIM</label>
                  <input
                    type="text"
                    placeholder="+229 97 00 00 00"
                    value={editingBalise.numero_sim || ''}
                    onChange={(e) =>
                      setEditingBalise({ ...editingBalise, numero_sim: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Opérateur</label>
                  <input
                    type="text"
                    value={editingBalise.operateur_sim || 'MTN BENIN M2M'}
                    onChange={(e) =>
                      setEditingBalise({ ...editingBalise, operateur_sim: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Véhicule à Équiper</label>
                <select
                  value={editingBalise.vehicule_immat || ''}
                  onChange={(e) => {
                    const sel = vehicules.find((v) => v.immatriculation === e.target.value)
                    setEditingBalise({
                      ...editingBalise,
                      vehicule_id: sel?.id,
                      vehicule_immat: sel?.immatriculation,
                    })
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                >
                  <option value="">-- Aucun pour l'instant --</option>
                  {vehicules.map((v) => (
                    <option key={v.id} value={v.immatriculation}>
                      {v.immatriculation} ({v.marque} {v.modele})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-sky-600 text-white rounded-xl font-bold flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>Enregistrer la Balise</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default FlotteIntegrationsGpsPage
