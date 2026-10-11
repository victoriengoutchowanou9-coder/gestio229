// =============================================================================
// GESTIO 229 ADMIN — Page Paramètres Super Admin
// =============================================================================

import React from 'react'
import { Settings, Shield, Database, Info } from 'lucide-react'

const AdminSettings: React.FC = () => {
  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-white text-2xl font-black">Paramètres</h1>
        <p className="text-slate-400 text-sm">Configuration du Back-Office GESTIO 229 ADMIN</p>
      </div>

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
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <div>
              <p className="text-slate-300 font-medium">Protection des routes</p>
              <p className="text-slate-500 text-xs">Token JWT vérifié côté serveur</p>
            </div>
            <span className="text-emerald-400 text-xs font-semibold">✅ Actif</span>
          </div>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-slate-300 font-medium">Limite de tentatives</p>
              <p className="text-slate-500 text-xs">Rate limiting sur la connexion (côté API)</p>
            </div>
            <span className="text-emerald-400 text-xs font-semibold">10 / 15 min</span>
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
        <div className="bg-blue-900/20 border border-blue-700/40 rounded-xl px-3 py-2 text-blue-300 text-xs">
          💡 Pour générer ADMIN_PASSWORD_HASH : <code>echo -n "VotreMotDePasse" | sha256sum</code>
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
            { label: 'Backend API', value: 'Vercel Serverless Functions' },
            { label: 'Frontend', value: 'React 18 + Vite + Tailwind CSS' },
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
