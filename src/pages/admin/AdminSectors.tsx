// =============================================================================
// GESTIO 229 ADMIN — Page Secteurs d'Activités
// Consultation et statistiques de chaque secteur
// =============================================================================

import React, { useState } from 'react'
import { useAdminSectorsStats } from '../../hooks/useAdminData'
import { Store, RefreshCw, Users, CheckCircle2, Clock } from 'lucide-react'

// Catalogue complet des secteurs (source de vérité : moduleRegistry.ts)
const ALL_SECTORS = [
  { slug: 'quincaillerie', name: 'Quincaillerie & Matériaux', emoji: '🔧' },
  { slug: 'poissonnerie', name: 'Poissonnerie & Produits Frais', emoji: '🐟' },
  { slug: 'restaurant', name: 'Bar / Restaurant / Maquis / Fast Food', emoji: '🍽️' },
  { slug: 'supermarche', name: 'Supermarché / Supérette', emoji: '🛒' },
  { slug: 'pharmacie', name: 'Pharmacie / Dépôt Médical', emoji: '💊' },
  { slug: 'station-service', name: 'Station-Service / Hydrocarbures', emoji: '⛽' },
  { slug: 'hotel', name: 'Hôtel / Résidence / Auberge', emoji: '🏨' },
  { slug: 'ecole', name: 'École / Centre de Formation', emoji: '🎓' },
  { slug: 'immobilier', name: 'Gestion Locative / Immobilier', emoji: '🏠' },
  { slug: 'garage', name: 'Atelier / Garage / Mécanique', emoji: '🔩' },
  { slug: 'imprimerie', name: 'Imprimerie / Sérigraphie', emoji: '🖨️' },
  { slug: 'brasserie', name: 'Brasserie / Dépôt de Boissons', emoji: '🍺' },
  { slug: 'microfinance', name: 'Microfinance / Tontine', emoji: '💰' },
  { slug: 'agro-business', name: 'Agro-Business / Élevage', emoji: '🌾' },
  { slug: 'cosmetiques', name: 'Cosmétiques / Salons de Beauté', emoji: '💄' },
  { slug: 'mercerie', name: 'Mercerie / Couture', emoji: '🧵' },
  { slug: 'boulangerie', name: 'Boulangerie / Pâtisserie', emoji: '🥖' },
  { slug: 'transport', name: 'Transport / Logistique', emoji: '🚛' },
]

function matchSector(slugFromDb: string, catalogSlug: string): boolean {
  const normalize = (s: string) => s.replace(/^sec-/, '').toLowerCase().replace(/[-_\s]/g, '')
  return normalize(slugFromDb) === normalize(catalogSlug) ||
    normalize(slugFromDb).includes(normalize(catalogSlug)) ||
    normalize(catalogSlug).includes(normalize(slugFromDb))
}

const AdminSectors: React.FC = () => {
  const { data: stats, loading, reload } = useAdminSectorsStats()
  const [selected, setSelected] = useState<string | null>(null)

  // Fusionner le catalogue avec les stats
  const sectorsWithStats = ALL_SECTORS.map((sector) => {
    // Chercher les stats correspondantes
    let sectorStats = { companies: 0, trial: 0, active: 0 }
    if (stats) {
      for (const [key, val] of Object.entries(stats)) {
        if (matchSector(key, sector.slug)) {
          sectorStats = val as any
          break
        }
      }
    }
    return { ...sector, ...sectorStats }
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-white text-2xl font-black">Secteurs d'activités</h1>
          <p className="text-slate-400 text-sm">{ALL_SECTORS.length} secteurs disponibles dans GESTIO 229</p>
        </div>
        <button onClick={reload} className="flex items-center gap-2 bg-slate-800 border border-slate-700 text-slate-300 px-4 py-2 rounded-xl text-sm hover:bg-slate-700 transition">
          <RefreshCw className="w-4 h-4" />
          Actualiser
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sectorsWithStats.map((sector) => (
            <div
              key={sector.slug}
              className={`bg-slate-900 border rounded-2xl p-4 cursor-pointer transition hover:border-slate-600 ${selected === sector.slug ? 'border-emerald-600' : 'border-slate-800'}`}
              onClick={() => setSelected(selected === sector.slug ? null : sector.slug)}
            >
              <div className="flex items-start gap-3 mb-3">
                <span className="text-3xl">{sector.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm leading-tight">{sector.name}</p>
                  <p className="text-slate-500 text-xs font-mono mt-0.5">{sector.slug}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-800 rounded-xl py-2">
                  <p className="text-white font-black text-lg">{sector.companies}</p>
                  <p className="text-slate-500 text-[10px]">Entreprises</p>
                </div>
                <div className="bg-emerald-900/30 rounded-xl py-2">
                  <p className="text-emerald-400 font-black text-lg">{sector.active}</p>
                  <p className="text-slate-500 text-[10px]">Actives</p>
                </div>
                <div className="bg-orange-900/20 rounded-xl py-2">
                  <p className="text-orange-400 font-black text-lg">{sector.trial}</p>
                  <p className="text-slate-500 text-[10px]">Essai</p>
                </div>
              </div>

              {/* Barre d'activité */}
              {sector.companies > 0 && (
                <div className="mt-3 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${Math.min(100, (sector.active / sector.companies) * 100)}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Note informative */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h3 className="text-white font-bold mb-2 flex items-center gap-2">
          <Store className="w-4 h-4 text-cyan-400" />
          À propos des secteurs
        </h3>
        <div className="space-y-2 text-slate-400 text-sm">
          <p>• Les secteurs sont définis dans le code source (<code className="text-emerald-400">moduleRegistry.ts</code>) et ne sont pas éditables depuis cette interface.</p>
          <p>• Chaque secteur dispose de ses propres modules, menus et données strictement isolés.</p>
          <p>• Pour ajouter un nouveau secteur, modifier <code className="text-emerald-400">ALL_SECTORS_CATALOG</code> dans le code.</p>
          <p>• Les statistiques ci-dessus sont calculées à partir des entreprises inscrites ayant sélectionné chaque secteur.</p>
        </div>
      </div>
    </div>
  )
}

export default AdminSectors
