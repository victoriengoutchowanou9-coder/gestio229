// =============================================================================
// GESTIO 229 ADMIN — Page Paramètres Super Admin & Configuration Paiement Manuel
// =============================================================================

import React, { useState, useEffect } from 'react'
import {
  Shield, Database, Info, Smartphone, Save, CheckCircle2, AlertCircle, MessageSquare
} from 'lucide-react'
import {
  getParametresPaiementManuel,
  sauvegarderParametresPaiementManuel,
  ParametresPaiementManuel,
  DEFAULT_MANUAL_PAYMENT_SETTINGS,
} from '../../services/abonnementService'

const AdminSettings: React.FC = () => {
  const [paymentSettings, setPaymentSettings] = useState<ParametresPaiementManuel>(
    DEFAULT_MANUAL_PAYMENT_SETTINGS
  )
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    getParametresPaiementManuel()
      .then((res) => {
        setPaymentSettings(res)
        setLoadingSettings(false)
      })
      .catch(() => setLoadingSettings(false))
  }, [])

  const handleSavePaymentSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFeedback(null)
    const res = await sauvegarderParametresPaiementManuel(paymentSettings, 'Super Admin')
    setSaving(false)
    if (res.success) {
      setFeedback({
        type: 'success',
        text: 'Les paramètres de paiement manuel ont été enregistrés et sont immédiatement actifs pour tous les utilisateurs.',
      })
    } else {
      setFeedback({
        type: 'error',
        text: res.error || 'Erreur lors de la sauvegarde des paramètres.',
      })
    }
  }

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      <div>
        <h1 className="text-white text-2xl font-black">Paramètres & Paiement Manuel</h1>
        <p className="text-slate-400 text-sm">
          Configuration du Back-Office Super Admin et des coordonnées officielles de paiement d'abonnement
        </p>
      </div>

      {/* Section 7.1 — Informations de Paiement Manuel configurables depuis le Super Admin */}
      <form
        onSubmit={handleSavePaymentSettings}
        className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-6 space-y-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-white font-bold text-lg flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-emerald-400" />
              Configuration du Paiement Manuel (Section 7.1)
            </h2>
            <p className="text-slate-400 text-xs mt-1">
              Ces informations sont affichées en temps réel aux utilisateurs lorsqu'ils choisissent le mode de paiement « Manuel » dans la page Mon Abonnement.
            </p>
          </div>
          {paymentSettings.updated_at && (
            <span className="text-[11px] text-slate-500 shrink-0">
              Mis à jour : {new Date(paymentSettings.updated_at).toLocaleDateString('fr-FR')}
            </span>
          )}
        </div>

        {loadingSettings ? (
          <div className="py-6 text-center text-xs text-slate-400">Chargement des paramètres...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Numéro de téléphone destiné aux dépôts *
                </label>
                <input
                  type="text"
                  required
                  value={paymentSettings.deposit_phone}
                  onChange={(e) =>
                    setPaymentSettings((p) => ({ ...p, deposit_phone: e.target.value }))
                  }
                  placeholder="Ex: +229 01 97 00 00 00"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nom du titulaire du compte / bénéficiaire *
                </label>
                <input
                  type="text"
                  required
                  value={paymentSettings.beneficiary_name}
                  onChange={(e) =>
                    setPaymentSettings((p) => ({ ...p, beneficiary_name: e.target.value }))
                  }
                  placeholder="Ex: GESTIO 229 SARL"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nom du service de paiement ou de l'opérateur *
                </label>
                <input
                  type="text"
                  required
                  value={paymentSettings.payment_operator}
                  onChange={(e) =>
                    setPaymentSettings((p) => ({ ...p, payment_operator: e.target.value }))
                  }
                  placeholder="Ex: MTN Mobile Money / Moov Money / Celtiis Cash"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                  Numéro WhatsApp pour recevoir les preuves de paiement *
                </label>
                <input
                  type="text"
                  required
                  value={paymentSettings.whatsapp_number}
                  onChange={(e) =>
                    setPaymentSettings((p) => ({ ...p, whatsapp_number: e.target.value }))
                  }
                  placeholder="Ex: +229 01 97 00 00 00"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Instructions de paiement destinées à l'utilisateur *
              </label>
              <textarea
                rows={4}
                required
                value={paymentSettings.payment_instructions}
                onChange={(e) =>
                  setPaymentSettings((p) => ({ ...p, payment_instructions: e.target.value }))
                }
                placeholder="Instructions détaillées de dépôt et d'envoi de preuve..."
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            {feedback && (
              <div
                className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                  feedback.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-300'
                }`}
              >
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <span>{feedback.text}</span>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Enregistrement...' : 'Enregistrer les paramètres de paiement'}
              </button>
            </div>
          </div>
        )}
      </form>

      {/* Sécurité */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <h3 className="text-white font-bold flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          Sécurité & Authentification
        </h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <div>
              <p className="text-slate-300 font-medium">Identifiants Super Admin</p>
              <p className="text-slate-500 text-xs">Configurés dans les variables d'environnement Vercel</p>
            </div>
            <span className="text-emerald-400 text-xs font-semibold">🔒 Sécurisé</span>
          </div>
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <div>
              <p className="text-slate-300 font-medium">Durée de session</p>
              <p className="text-slate-500 text-xs">Expiration automatique après inactivité</p>
            </div>
            <span className="text-slate-300 text-xs font-semibold">8 heures</span>
          </div>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-slate-300 font-medium">Protection anti-doublon des preuves de paiement</p>
              <p className="text-slate-500 text-xs">Contrôle d'unicité sur les références et captures validées</p>
            </div>
            <span className="text-emerald-400 text-xs font-semibold">✅ Actif</span>
          </div>
        </div>
      </div>

      {/* Variables d'environnement requises */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <h3 className="text-white font-bold flex items-center gap-2">
          <Database className="w-4 h-4 text-blue-400" />
          Variables d'environnement Vercel requises
        </h3>
        <div className="space-y-2">
          {[
            { key: 'ADMIN_USERNAME', desc: 'Identifiant du Super Admin', required: true },
            { key: 'ADMIN_PASSWORD_HASH', desc: 'Hash SHA-256 du mot de passe', required: true },
            { key: 'ADMIN_SESSION_SECRET', desc: 'Secret JWT (chaîne longue aléatoire)', required: true },
            { key: 'SUPABASE_SERVICE_ROLE_KEY', desc: 'Clé service Supabase (bypass RLS)', required: true },
            { key: 'VITE_SUPABASE_URL', desc: 'URL du projet Supabase', required: true },
            { key: 'VITE_SUPABASE_ANON_KEY', desc: 'Clé anonyme Supabase (déjà configurée)', required: false },
          ].map(({ key, desc, required }) => (
            <div key={key} className="bg-slate-800/50 rounded-xl px-3 py-2.5 flex items-center gap-3">
              <code className={`text-xs font-mono font-bold ${required ? 'text-emerald-400' : 'text-slate-400'}`}>{key}</code>
              <span className="text-slate-500 text-xs flex-1">{desc}</span>
              {required && <span className="text-red-400 text-[10px] font-bold">REQUIS</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Infos plateforme */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <h3 className="text-white font-bold flex items-center gap-2">
          <Info className="w-4 h-4 text-purple-400" />
          À propos de la plateforme
        </h3>
        <div className="space-y-2 text-sm">
          {[
            { label: 'Plateforme', value: 'GESTIO 229 — ERP SaaS Multi-secteurs' },
            { label: 'Concepteur', value: 'Propriétaire & Super Admin' },
            { label: 'Base de données', value: 'Supabase (PostgreSQL)' },
            { label: 'Déploiement', value: 'Vercel' },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between border-b border-slate-800 pb-2">
              <span className="text-slate-500">{label}</span>
              <span className="text-slate-300 font-medium text-right">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default AdminSettings
