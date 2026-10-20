// Bridge CommonJS pour moduleRegistry
const fs = require('fs')
const path = require('path')

const regPath = path.join(__dirname, '..', 'src', 'core', 'modules', 'moduleRegistry.ts')
const content = fs.readFileSync(regPath, 'utf8')

// Extraire ALL_COMMON_MODULE_IDS
const commonMatch = content.match(/export const ALL_COMMON_MODULE_IDS: string\[\] = \[([\s\S]*?)\]/)
const ALL_COMMON_MODULE_IDS = commonMatch[1]
  .split(',')
  .map(s => s.replace(/['"\s]/g, ''))
  .filter(Boolean)

// Extraire ALL_SECTORS_CATALOG
const ALL_SECTORS_CATALOG = [
  { slug: 'boutique', name: 'Boutique & Commerce' },
  { slug: 'quincaillerie', name: 'Quincaillerie & Matériaux' },
  { slug: 'poissonnerie', name: 'Poissonnerie & Frais' },
  { slug: 'restaurant', name: 'Bar, Restaurant & Maquis' },
  { slug: 'supermarche', name: 'Supermarché & Supérette' },
  { slug: 'pharmacie', name: 'Pharmacie & Dépôt Médical' },
  { slug: 'station-service', name: 'Station-Service' },
  { slug: 'hotel', name: 'Hôtel, Résidence & Auberge' },
  { slug: 'ecole', name: 'École & Centre de Formation' },
  { slug: 'immobilier', name: 'Gestion Immobilière' },
  { slug: 'garage', name: 'Garage & Mécanique' },
  { slug: 'imprimerie', name: 'Imprimerie & Sérigraphie' },
  { slug: 'brasserie', name: 'Brasserie & Dépôt Boissons' },
  { slug: 'microfinance', name: 'Microfinance & Tontine' },
  { slug: 'agrobusiness', name: 'Agrobusiness' },
  { slug: 'cosmetiques', name: 'Cosmétiques & Beauté' },
  { slug: 'mercerie', name: 'Mercerie & Prêt-à-porter' },
  { slug: 'boulangerie', name: 'Boulangerie & Pâtisserie' },
  { slug: 'transport', name: 'Transport & Logistique' },
]

// Extraire MODULE_REGISTRY simplifié
const modMatches = [...content.matchAll(/'([a-z0-9_-]+)':\s*\{([\s\S]*?group:\s*'([a-z0-9_-]+)'[\s\S]*?)\}/g)]
const MODULE_REGISTRY = {}
for (const m of modMatches) {
  const id = m[1]
  const isCommon = m[2].includes('isCommon: true')
  const group = m[3]
  let sectorSlugs = []
  const secMatch = m[2].match(/sectorSlugs:\s*\[([\s\S]*?)\]/)
  if (secMatch) {
    sectorSlugs = secMatch[1].split(',').map(s => s.replace(/['"\s]/g, '')).filter(Boolean)
  }
  MODULE_REGISTRY[id] = { id, isCommon, group, sectorSlugs }
}

function resolveModulesForSector(sectorSlug, enabledModules = [], specificModules = []) {
  const result = []
  const addedIds = new Set()

  const baseModules = enabledModules && enabledModules.length > 0 ? enabledModules : ALL_COMMON_MODULE_IDS
  const combinedCommonIds = Array.from(new Set([...baseModules, ...ALL_COMMON_MODULE_IDS]))

  for (const moduleId of combinedCommonIds) {
    const mod = MODULE_REGISTRY[moduleId]
    if (mod && mod.isCommon && !addedIds.has(moduleId)) {
      result.push(mod)
      addedIds.add(moduleId)
    }
  }

  const candidateSpecific = (specificModules && specificModules.length > 0)
    ? specificModules
    : Object.keys(MODULE_REGISTRY).filter((id) => {
        const m = MODULE_REGISTRY[id]
        return m && !m.isCommon && (m.sectorSlugs?.includes(sectorSlug) ?? false)
      })

  for (const moduleId of candidateSpecific) {
    const mod = MODULE_REGISTRY[moduleId]
    if (mod && !mod.isCommon && !addedIds.has(moduleId) && (mod.sectorSlugs?.includes(sectorSlug) ?? false)) {
      result.push(mod)
      addedIds.add(moduleId)
    }
  }

  return result
}

function getSectorCanonicalModules(sectorSlug) {
  const clean = sectorSlug ? sectorSlug.toLowerCase().trim().replace(/^sec-/, '') : ''
  return resolveModulesForSector(clean)
}

function getSectorCanonicalModuleIds(sectorSlug) {
  return getSectorCanonicalModules(sectorSlug).map(m => m.id)
}

module.exports = {
  ALL_COMMON_MODULE_IDS,
  ALL_SECTORS_CATALOG,
  MODULE_REGISTRY,
  resolveModulesForSector,
  getSectorCanonicalModules,
  getSectorCanonicalModuleIds
}
