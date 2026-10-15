// =============================================================================
// GESTIO 229 SaaS — Paramètres Géolocalisation & Télématique Flotte
// Clé API Google Maps Platform, limites de vitesse, seuils d'alertes & Webhooks
// =============================================================================

import React, { useEffect, useState } from 'react'
import {
  Settings,
  Key,
  Shield,
  Gauge,
  Bell,
  CheckCircle2,
  ExternalLink,
  Save,
  Radio,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  getParametresFlotte,
  saveParametresFlotte,
  type FlotteParametres,
} from '../../../services/flotteService'

export const FlotteParametresGpsPage: React.FC = () => {
  const { company } = useTenant()
  const companyId = company?.id || ''

  const [params, setParams] = useState<FlotteParametres>({
    company_id: companyId,
    google_maps_api_key: '',
    vitesse_max_ville_kmh: 50,
    vitesse_max_route_kmh: 90,
    vitesse_max_autoroute_kmh: 110,
    duree_arret_excessif_minutes: 30,
    alerte_email_active: true,
    alerte_sms_active: false,
    email_destinataire_alertes: '',
    serveur_gps_port: 5027,
    cle_secrete_webhook: 'sec_teltonika_flotte_229',
  })
  const [loading, setLoading] = useState<boolean>(true)
  const [saving, setSaving] = useState<boolean>(false)
  const [successMsg, setSuccessMsg] = useState<string>('')

  useEffect(() => {
    if (!companyId) return
    getParametresFlotte(companyId).then((data) => {
      setParams(data)
      setLoading(false)
    })
  }, [companyId])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSuccessMsg('')
    try {
      const updated = await saveParametresFlotte(companyId, params)
      setParams(updated)
      setSuccessMsg('Paramètres télématiques et clé Google Maps enregistrés avec succès !')
      setTimeout(() => setSuccessMsg(''), 4000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-4xl mx-auto">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Settings className="w-6 h-6 text-sky-600" />
            <span>Paramètres de Géolocalisation & Télématique</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Configuration Google Maps Platform, seuils d'alertes de vitesse et protocoles de communication
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-xs font-semibold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6 text-xs">
        {/* Section Google Maps Platform */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center space-x-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Google Maps Platform API
              </h2>
              <p className="text-slate-500">
                Activation des cartes dynamiques officielles Google Maps, Satellite, Places & Itinéraires
              </p>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1">
              Clé d'API Google Maps (Google Cloud Platform)
            </label>
            <input
              type="text"
              placeholder="AIzaSyB..."
              value={params.google_maps_api_key || ''}
              onChange={(e) => setParams({ ...params, google_maps_api_key: e.target.value.trim() })}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-xs focus:outline-none focus:border-sky-500"
            />
            <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1.5">
              <span>Services requis sur Google Cloud Console :</span>
              <strong className="text-slate-700 dark:text-slate-300">
                Maps JavaScript API, Places API, Geocoding API
              </strong>
            </p>
          </div>

          <div className="p-3 bg-sky-50 dark:bg-sky-950/40 rounded-xl border border-sky-200 dark:border-sky-900 text-sky-900 dark:text-sky-200 flex items-start gap-2.5">
            <Shield className="w-4 h-4 text-sky-600 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <span>Si la clé n'est pas renseignée, GESTIO 229 bascule automatiquement sur le </span>
              <strong>Mode Simulateur & Cartographie Vectorielle Bénin</strong> sans bloquer
              l'application. Dès la saisie d'une clé valide, la vue satellite et les itinéraires réels
              s'activent instantanément.
            </div>
          </div>
        </div>

        {/* Section Seuils de Vitesse & Alertes */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center space-x-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Limites de Vitesse & Détection d'Excès
              </h2>
              <p className="text-slate-500">
                Déclenchement automatique d'alertes lors du dépassement des seuils définis
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold mb-1">Vitesse Max en Ville (km/h)</label>
              <input
                type="number"
                value={params.vitesse_max_ville_kmh}
                onChange={(e) =>
                  setParams({ ...params, vitesse_max_ville_kmh: Number(e.target.value) })
                }
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-bold"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Défaut: 50 km/h (Bénin)</span>
            </div>

            <div>
              <label className="block font-semibold mb-1">Vitesse Max sur Route (km/h)</label>
              <input
                type="number"
                value={params.vitesse_max_route_kmh}
                onChange={(e) =>
                  setParams({ ...params, vitesse_max_route_kmh: Number(e.target.value) })
                }
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-bold"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Défaut: 90 km/h</span>
            </div>

            <div>
              <label className="block font-semibold mb-1">Vitesse Max Autoroute (km/h)</label>
              <input
                type="number"
                value={params.vitesse_max_autoroute_kmh}
                onChange={(e) =>
                  setParams({ ...params, vitesse_max_autoroute_kmh: Number(e.target.value) })
                }
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-bold"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Défaut: 110 km/h</span>
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">
              Seuil d'Arrêt Prolongé / Moteur au Ralenti (minutes)
            </label>
            <input
              type="number"
              value={params.duree_arret_excessif_minutes}
              onChange={(e) =>
                setParams({ ...params, duree_arret_excessif_minutes: Number(e.target.value) })
              }
              className="w-48 px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-bold"
            />
          </div>
        </div>

        {/* Section Notifications & Serveur */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center space-x-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Notifications d'Alertes & Ingestion Réseau
              </h2>
              <p className="text-slate-500">
                Canaux d'envoi immédiat et ports d'écoute des traceurs GPS
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Email Destinataire des Alertes</label>
              <input
                type="email"
                placeholder="flotte@gestio229.bj"
                value={params.email_destinataire_alertes || ''}
                onChange={(e) =>
                  setParams({ ...params, email_destinataire_alertes: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Port Serveur GPS Ingestion</label>
              <input
                type="number"
                value={params.serveur_gps_port}
                onChange={(e) =>
                  setParams({ ...params, serveur_gps_port: Number(e.target.value) })
                }
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-mono"
              />
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={params.alerte_email_active}
                onChange={(e) => setParams({ ...params, alerte_email_active: e.target.checked })}
                className="rounded text-sky-600"
              />
              <span>Notifier par Email lors d'un incident critique (Excès majeur, Sortie de zone)</span>
            </label>
          </div>
        </div>

        {/* Bouton de sauvegarde */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg transition-transform active:scale-95 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Enregistrement...' : 'Enregistrer les Paramètres'}</span>
          </button>
        </div>
      </form>
    </div>
  )
}

export default FlotteParametresGpsPage
